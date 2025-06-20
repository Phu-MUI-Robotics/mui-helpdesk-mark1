const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const FormData = require('form-data');  // เพิ่มบรรทัดนี้

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || "5tEgj6rVoHGU8tu795bmdvDgcTD9qrKu6Q9CiU+tiNMHkLbFDhNIt4E1+CI9i6arTbirxg//fI0erUTtXOiHQVykPsiYRu9ZlJd7ObyhZPisKYjWpDlYLZVDLcnI1dVLhHy5c+2BNYa8YJqyNWIfdQdB04t89/1O/w1cDnyilFU=",
  channelSecret: process.env.CHANNEL_SECRET || "705adee04e0adfda3836fb4694317dbd"
}

const client = new line.Client(config);

//เก็บข้อมูลของแต่ละ User (ชั่วคราว)
const userSessions = new Map();

//Initial
app.get('/', (req, res) => {
  res.send('LINE Bot is running!');
});

// Webhook handler
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

function handleEvent(event) {
    const userId = event.source.userId;

    //รับข้อความจาก Rich Menu และข้อความทั่วไป
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;

        if (text === 'แจ้งปัญหาการใช้งานอุปกรณ์') {
            return showProblemTypes(event.replyToken, userId); //Step 1: เลือกประเภทปัญหา
        }

        return handleTextByStep(event, userId, text);
    }

    // รับรูปภาพ
    if (event.type === 'message' && event.message.type === 'image') {
        return handleImageUpload(event, userId);
    }

    //รับ Postback จาก Quick Reply
    if (event.type === 'postback') {
        const data = event.postback.data;

        if (data.startsWith('problem_type=')) {
            const problemType = data.split('=')[1];
            return askProblemDetails(event.replyToken, userId, problemType); //Step 2: ถามรายละเอียดปัญหา
        }

        if (data === 'skip_image'){
            return askContactInfo(event.replyToken, userId);
        }

        if (data === 'finish_images') {
            return askContactInfo(event.replyToken, userId);
        }

        if (data === 'submit_report') {
            return submitReport(event.replyToken, userId);
        }
    }

    return Promise.resolve(null);
}

//Step 1 : เลือกประเภทปัญหา
function showProblemTypes(replyToken, userId) {
    userSessions.set(userId, {
        step: 'select_type',
        timestamp: getThaiDateTime()
    });

    const message = {
        type: 'flex',
        altText: 'กรุณาเลือกประเภทปัญหาที่ต้องการแจ้ง',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: 'เลือกประเภทปัญหา',
                        weight: 'bold',
                        size: 'lg',
                        align: 'center',
                        color: '#ffffff'
                    }
                ],
                backgroundColor: '#4285f4',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: 'กรุณาเลือกประเภทปัญหาที่ต้องการแจ้ง:',
                        wrap: true,
                        margin: 'md'
                    },
                    {
                        type: 'separator',
                        margin: 'lg'
                    },
                    {
                        type: 'button',
                        action: {
                            type: 'postback',
                            label: '🔧 ปัญหาด้านอุปกรณ์',
                            data: 'problem_type=hardware',
                            displayText: 'แจ้งปัญหาด้านอุปกรณ์'
                        },
                        style: 'secondary',
                        margin: 'lg'
                    },
                    {
                        type: 'button',
                        action: {
                            type: 'postback',
                            label: '💻 ปัญหาด้าน Software',
                            data: 'problem_type=software',
                            displayText: 'แจ้งปัญหาด้าน Software'
                        },
                        style: 'secondary',
                        margin: 'md'
                    }
                ],
                spacing: 'md',
                paddingAll: 'lg'
            }
        }
    };

    return client.replyMessage(replyToken, message);
}

// Step 2: ถามรายละเอียดปัญหา
function askProblemDetails(replyToken, userId, problemType) {
  const session = userSessions.get(userId) || {};
  session.problemType = problemType;
  session.problemTypeName = getProblemTypeName(problemType);
  session.step = 'ask_details';
  userSessions.set(userId, session);
  
  const message = {
    type: 'text',
    text: `📝 คุณเลือกแจ้ง "${session.problemTypeName}"\n\nกรุณาอธิบายรายละเอียดปัญหา:\n\nตัวอย่าง:\n- อาการที่เกิดขึ้น : \n- เมื่อไหร่ที่เกิดปัญหา : \n- สิ่งที่ทำก่อนเกิดปัญหา : `
  };
  
  return client.replyMessage(replyToken, message);
}

function handleTextByStep(event, userId, text) {
    const session = userSessions.get(userId);

    if (!session) {
        return Promise.resolve(null);
    }

    if (session.step === 'ask_details') {
        //เก็บรายละเอียดปัญหา
        session.problemDetails = text;
        session.step = 'ask_image';
        userSessions.set(userId, session);

        return askForImage(event.replyToken, userId); // Step 3: แนบรูปภาพ
    }

    if (session.step === 'ask_contact') {
        // เก็บข้อมูลติดต่อ
        session.contactInfo = text;
        session.step = 'confirm';
        userSessions.set(userId, session);
        
        return showSummary(event.replyToken, userId); // Step 5: แสดงสรุปข้อมูล
    }

    return Promise.resolve(null);
}

// Step 3: แนบรูปภาพ
function askForImage(replyToken, userId) {
    const session = userSessions.get(userId);
    session.images = [];
    session.imageCount = 0;
    userSessions.set(userId, session);

    const message = {
        type: 'text',
        text: '📷 กรุณาถ่ายรูปปัญหาที่พบ\n(สูงสุด 3 รูป)\n\nรูปที่ 1/3\n\n(กด "ข้าม" เมื่อไม่มีรูปภาพ)',
        quickReply: {
            items: [
                {
                    type: 'action',
                    action: {
                        type: 'postback',
                        label: '⏭️ ข้าม',
                        data: 'skip_image',
                        displayText: 'ข้ามการอัปโหลดรูปภาพ'
                    }
                }
            ]
        }
    };

    return client.replyMessage(replyToken, message);
}

async function handleImageUpload(event, userId) {
    const session = userSessions.get(userId);
  
    if (!session || session.step !== 'ask_image') {
        return Promise.resolve(null);
    }

    try {
        session.images.push(event.message.id);
        session.imageCount = session.images.length;
        userSessions.set(userId, session);

        let responseMessage;

        if (session.imageCount < 3) {
            responseMessage = {
                type: 'text',
                text: `✅ ได้รับรูปภาพแล้ว (${session.imageCount}/3)\n\nส่งรูปเพิ่มเติม หรือกด "เสร็จสิ้น" เพื่อดำเนินการต่อ`,
                quickReply: {
                    items: [
                        {
                            type: 'action',
                            action: {
                                type: 'postback',
                                label: '✅ เสร็จสิ้น',
                                data: 'finish_images',
                                displayText: 'เสร็จสิ้นการส่งรูปภาพ'
                            }
                        }
                    ]
                }
            };
        } else {
            // ครบ 3 รูปแล้ว
            responseMessage = {
                type: 'text',
                text: `✅ ได้รับรูปภาพครบ 3 รูปแล้ว\n\nดำเนินการต่อไปขั้นตอนถัดไป`
            };
            
            // ไปขั้นตอนถัดไปเลย
            session.step = 'ask_contact';
            userSessions.set(userId, session);
            
            await client.replyMessage(event.replyToken, responseMessage);
            return askContactInfo(null, userId);
        }

        return client.replyMessage(event.replyToken, responseMessage);

    } catch (error) {
        console.error('Error handling image:', error);
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'เกิดข้อผิดพลาดในการรับรูปภาพ กรุณาลองใหม่อีกครั้ง'
        });
    }
}

// Step 4: ถามข้อมูลติดต่อ
function askContactInfo(replyToken, userId) {
    const session = userSessions.get(userId);
    session.step = 'ask_contact';
    userSessions.set(userId, session);

    const message = {
        type: 'text',
        text: '📞 กรุณาใส่ข้อมูลติดต่อของคุณ:\n\nตัวอย่าง:\n- เบอร์โทรศัพท์: 081-234-5678\n- อีเมล: example@email.com\n- ชื่อ-นามสกุล: สมชาย ใจดี\n\n(ใส่ข้อมูลที่สะดวกให้ติดต่อกลับ)'
    };

    if(replyToken) {
        return client.replyMessage(replyToken, message);
    } else {
        return client.pushMessage(userId, message); // ใช้ pushMessage แทน replyMessage
    }
}

// Step 5: แสดงสรุปข้อมูล (แก้ไขเป็น Flex Message)
function showSummary(replyToken, userId) {
    const session = userSessions.get(userId);

    const imageText = session.images && session.images.length > 0 ? `มี ${session.images.length} รูป` : 'ไม่มี';

    const message = {
        type: 'flex',
        altText: 'สรุปการแจ้งปัญหา - กรุณายืนยันการส่งข้อมูล',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: '📋 สรุปการแจ้งปัญหา',
                        weight: 'bold',
                        size: 'lg',
                        align: 'center',
                        color: '#ffffff'
                    }
                ],
                backgroundColor: '#ff6b6b',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🔸 ประเภท:',
                                        size: 'sm',
                                        color: '#666666',
                                        flex: 3
                                    },
                                    {
                                        type: 'text',
                                        text: session.problemTypeName,
                                        size: 'sm',
                                        color: '#333333',
                                        flex: 5,
                                        wrap: true
                                    }
                                ],
                                margin: 'sm'
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🔸 รายละเอียด:',
                                        size: 'sm',
                                        color: '#666666',
                                        flex: 3
                                    },
                                    {
                                        type: 'text',
                                        text: session.problemDetails,
                                        size: 'sm',
                                        color: '#333333',
                                        flex: 5,
                                        wrap: true
                                    }
                                ],
                                margin: 'sm'
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🔸 รูปภาพ:',
                                        size: 'sm',
                                        color: '#666666',
                                        flex: 3
                                    },
                                    {
                                        type: 'text',
                                        text: imageText,
                                        size: 'sm',
                                        color: session.images && session.images.length > 0 ? '#4CAF50' : '#FF9800',
                                        flex: 5,
                                        wrap: true
                                    }
                                ],
                                margin: 'sm'
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🔸 ข้อมูลติดต่อ:',
                                        size: 'sm',
                                        color: '#666666',
                                        flex: 3
                                    },
                                    {
                                        type: 'text',
                                        text: session.contactInfo,
                                        size: 'sm',
                                        color: '#333333',
                                        flex: 5,
                                        wrap: true
                                    }
                                ],
                                margin: 'sm'
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🔸 เวลา:',
                                        size: 'sm',
                                        color: '#666666',
                                        flex: 3
                                    },
                                    {
                                        type: 'text',
                                        text: session.timestamp,
                                        size: 'sm',
                                        color: '#333333',
                                        flex: 5,
                                        wrap: true
                                    }
                                ],
                                margin: 'sm'
                            }
                        ],
                        margin: 'lg'
                    },
                    {
                        type: 'separator',
                        margin: 'lg'
                    },
                    {
                        type: 'text',
                        text: '❓ ยืนยันการส่งข้อมูลหรือไม่?',
                        weight: 'bold',
                        size: 'md',
                        align: 'center',
                        margin: 'lg',
                        color: '#333333'
                    }
                ],
                spacing: 'sm',
                paddingAll: 'lg'
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        action: {
                            type: 'postback',
                            label: '✅ ยืนยันส่ง',
                            data: 'submit_report',
                            displayText: 'ยืนยันส่งรายงานปัญหา'
                        },
                        style: 'primary',
                        color: '#4CAF50'
                    },
                    {
                        type: 'button',
                        action: {
                            type: 'message',
                            label: '❌ ยกเลิก',
                            text: 'ยกเลิกการแจ้งปัญหา'
                        },
                        style: 'secondary',
                        margin: 'sm'
                    }
                ],
                spacing: 'sm',
                paddingAll: 'lg'
            }
        }
    };

    return client.replyMessage(replyToken, message);
}

// Step 6: submit the report (แก้ไขให้ถูกต้อง)
async function submitReport(replyToken, userId) {
    const session = userSessions.get(userId);

    if (!session) {
        return client.replyMessage(replyToken, {
            type: 'text',
            text: 'ไม่พบข้อมูล กรุณาเริ่มต้นใหม่'
        });
    }

    const reportData = {
        user_id: userId,
        problem_type: session.problemType,
        problem_type_name: session.problemTypeName,
        problem_details: session.problemDetails || 'ไม่ระบุ',
        image_ids: session.images || [],                               
        image_count: session.images ? session.images.length : 0,      
        contact_info: session.contactInfo || 'ไม่ระบุ',               
        timestamp: session.timestamp || getThaiDateTime(),
        status: 'pending',
        ticket_id: generateTicketId()
    };

    try {
        // แจ้งเตือน Telegram
        await notifyTelegram(reportData);

        //ลบ session หลังจากส่งข้อมูล
        userSessions.delete(userId);

        const imageText = reportData.image_count > 0                    
            ? `📷 รูปภาพ: ${reportData.image_count} รูป` 
            : '📷 รูปภาพ: ไม่มี';
        
        const successMessage = {
            type: 'text',
            text: `✅ ส่งรายงานปัญหาเรียบร้อยแล้ว!\n\n` +
                `🎫 หมายเลขติดตาม: ${reportData.ticket_id}\n` +
                `📧 ข้อมูลได้ถูกบันทึกแล้ว\n` +
                `${imageText}\n` +
                `🔔 ทางทีมงานจะติดต่อกลับไปครับ\n\n` +
                `ขอบคุณที่ใช้บริการครับ 🙏`
        };

        console.log('Report Data:', reportData);

        return client.replyMessage(replyToken, successMessage);

    } catch (error) {
        console.error('Error submitting report:', error);
        
        return client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ เกิดข้อผิดพลาดในการส่งข้อมูล\nกรุณาลองใหม่อีกครั้ง หรือติดต่อทีมงานโดยตรง'
        });
    }
}

// Telegram Notification Function (แก้ไขใหม่)
async function notifyTelegram(reportData) {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '7501921791:AAHq28KxeNcGRAks4DGMoh6CmQw32chwOaQ';
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || '-4699760769';

    try {
        const message = `📋 *แจ้งปัญหาใหม่*
🎫 หมายเลขติดตาม: ${reportData.ticket_id}
🔸 ประเภท: ${reportData.problem_type_name}
🔸 รายละเอียด: ${reportData.problem_details}
🔸 รูปภาพ: ${reportData.image_count > 0 ? `มี ${reportData.image_count} รูป` : 'ไม่มีรูปภาพ'}
🔸 ข้อมูลติดต่อ: ${reportData.contact_info}
🔸 เวลา: ${reportData.timestamp}`;

        // ส่งข้อความไปยัง Telegram
        await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'Markdown'
        });

        // ส่งรูปภาพ (ถ้ามี)
        if (reportData.image_ids && reportData.image_ids.length > 0) {
            for (let i = 0; i < reportData.image_ids.length; i++) {
                const imageId = reportData.image_ids[i];
                try {
                    // ดาวน์โหลดรูปภาพจาก LINE
                    const imageResponse = await axios.get(`https://api-data.line.me/v2/bot/message/${imageId}/content`, {
                        headers: {
                            'Authorization': `Bearer ${config.channelAccessToken}`
                        },
                        responseType: 'stream'
                    });

                    // ส่งรูปภาพไปยัง Telegram ด้วย FormData
                    const formData = new FormData();
                    formData.append('chat_id', telegramChatId);
                    formData.append('photo', imageResponse.data, {
                        filename: `image_${i + 1}.jpg`,
                        contentType: 'image/jpeg'
                    });
                    formData.append('caption', `รูปภาพที่ ${i + 1} - ${reportData.ticket_id}`);

                    await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, formData, {
                        headers: formData.getHeaders()
                    });

                    console.log(`Successfully sent image ${i + 1} to Telegram`);

                } catch (imageError) {
                    console.error(`Error sending image ${i + 1}:`, imageError.message);
                    
                    // ส่งข้อความแจ้งว่าไม่สามารถส่งรูปได้
                    await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                        chat_id: telegramChatId,
                        text: `❌ ไม่สามารถส่งรูปภาพที่ ${i + 1} ได้\nTicket: ${reportData.ticket_id}`
                    });
                }
            }
        }

        console.log('Successfully sent notification to Telegram');

    } catch (error) {
        console.error('Error sending notification to Telegram:', error.message);
        throw new Error(`Telegram notification failed: ${error.message}`);
    }
}

// Helper functions
function getProblemTypeName(type) {
  const types = {
    'hardware': 'ปัญหาด้านอุปกรณ์',
    'software': 'ปัญหาด้าน Software'
  };
  return types[type] || 'ไม่ระบุ';
}

function generateTicketId() {
  return 'TK' + Date.now().toString().slice(-8);
}

function getThaiDateTime() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot listening on port ${PORT}`);
});

module.exports = app;