import nodemailer from "nodemailer";
import { __prod__ } from "src/constants";

export const sendEmail = async(to: string, text: string) => {
  // const testAccount = await nodemailer.createTestAccount()
  // console.log('testAccount', testAccount)

  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: 'ltpkfhawg3ldpp6c@ethereal.email',
      pass: 'wGSwjRQWZDSGPFmXNr'
    }
  })

  const info = await transporter.sendMail({
    from: '"Fred foo" <foo@example.com>',
    to,
    subject: "Change password",
    text,
  })

  console.log('Message send : %s"', info.messageId)

  console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info))
}