const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: "5tEgj6rVoHGU8tu795bmdvDgcTD9qrKu6Q9CiU+tiNMHkLbFDhNIt4E1+CI9i6arTbirxg//fI0erUTtXOiHQVykPsiYRu9ZlJd7ObyhZPisKYjWpDlYLZVDLcnI1dVLhHy5c+2BNYa8YJqyNWIfdQdB04t89/1O/w1cDnyilFU=",
  channelSecret: "57be272714027375e1593fcf2d112ec5"
}

const client = new line.Client(config);

app.get('/', (req, res) => {
  res.send('LINE Bot is running!');
});

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const echo = { type: 'text', text: 'สวัสดีครับ! ระบบพร้อมใช้งานแล้ว 🚀' };
    return client.replyMessage(event.replyToken, echo);
  }
  return Promise.resolve(null);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;