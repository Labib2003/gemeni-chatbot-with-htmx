import express from "express";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer } from "ws";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
dotenv.config();
const server = http.createServer(app);
const ws = new WebSocketServer({ server });

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

ws.on("connection", (connection) => {
  console.log("a new user joined");
  const chat = model.startChat();

  connection.on("message", async (message) => {
    const prompt = JSON.parse(message.toString()).prompt;
    let result = await chat.sendMessage(prompt);

    connection.send(`
      <div hx-swap-oob="beforeend:#chat">
        <div>
          <div class="text-end">
            <div class="inline-block bg-blue-500 text-white p-3 rounded-lg rounded-br-none max-w-[75%]">
              ${prompt}
            </div>
          </div>

          <div class="text-start mt-2">
            <div class="inline-block bg-gray-200 text-gray-800 p-3 rounded-lg rounded-bl-none max-w-[75%]">
              ${result.response.text()}
            </div>
          </div>
        </div>
      </div>
    `);
  });
  connection.on("close", () => {
    console.log("a user left");
  });
});

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

server.listen(5000, () => {
  console.log("server running on port 5000");
});
