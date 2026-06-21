import fs from "fs";

const content = fs.readFileSync("c:\\Users\\ZTX ALFA\\Documents\\Project semester 6\\smartbox-asisten\\arduino\\smartbox_esp32_s3\\smartbox_esp32_s3.ino", "utf8");
const lines = content.split("\n");
lines.forEach((line, index) => {
  if (line.includes("VOICE_MIN_GAP_MS")) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
