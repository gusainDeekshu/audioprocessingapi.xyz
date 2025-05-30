const { exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
require('dotenv').config();
const Email = process.env.EMAIL || "youremail.com";
const Password = process.env.PASSWORD || "password";

const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");

function cleanDownloadsDir() {
  fs.readdir(DOWNLOAD_DIR, (err, files) => {
    if (err) {
      console.error("Failed to read downloads directory:", err);
      return;
    }
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error("Stat error:", err);
        if (stats.isDirectory()) {
          fs.rm(filePath, { recursive: true, force: true }, err => {
            if (err) console.error("Remove dir failed:", err);
          });
        } else {
          fs.unlink(filePath, err => {
            if (err) console.error("Remove file failed:", err);
          });
        }
      });
    });
  });
}

const processVideo = async (req, res) => {
  const { youtubeUrl, effect } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: "youtubeUrl is required" });
  }

  const id = uuidv4();
  const mp3Path = path.join(DOWNLOAD_DIR, `${id}.mp3`);
  const processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);

  const ytCmd = `yt-dlp -u "${Email}" -p "${Password}" -x --audio-format mp3 -o "${DOWNLOAD_DIR}/${id}.%(ext)s" "${youtubeUrl}"`;

  exec(ytCmd, (err) => {
    if (err) {
      console.error("yt-dlp error:", err);
      return res.status(500).json({ error: "YouTube download failed. Video may require login." });
    }

    if (effect === "slowed_reverb") {
      const cmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;
      exec(cmd, (err2) => {
        if (err2) {
          console.error("FFmpeg error:", err2);
          return res.status(500).json({ error: "FFmpeg effect failed" });
        }
        return res.json({ downloadSlowedReverbUrl: `/downloads/${id}_processed.mp3` });
      });
    } else if (effect === "vocal_remove") {
      const cmd = `python -m demucs --two-stems=vocals -o "${DOWNLOAD_DIR}" "${mp3Path}"`;

      exec(cmd, (err3) => {
        if (err3) {
          console.error("Demucs error:", err3);
          return res.status(500).json({ error: "Demucs failed" });
        }
        const outputFile = path.join(DOWNLOAD_DIR, 'htdemucs', id, 'vocals.wav');
        if (!fs.existsSync(outputFile)) {
          return res.status(500).json({ error: "Demucs output missing" });
        }
        return res.json({
          downloadNoVocalUrl: `/downloads/htdemucs/${id}/no_vocals.wav`,
          downloadVocalUrl: `/downloads/htdemucs/${id}/vocals.wav`,
        });
      });
    } else {
      return res.json({ downloadUrl: `/downloads/${id}.mp3` });
    }
  });
};

module.exports = {
  processVideo,
  cleanDownloadsDir
};
