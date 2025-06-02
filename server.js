const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const effectroute=require('./routes/effectroute.js');
const { cleanDownloadsDir } = require("./controllers/effectcontroller.js");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CleaningInterval = process.env.CLEAN_INTERVAL || 3000;
app.use(cors({ origin: 'https://globebrandbuilder.com' }));
app.use(express.json());


const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);
app.use("/downloads", express.static(DOWNLOAD_DIR));
app.use("/api", effectroute);
app.use("/", (req, res) => {
  return res.status(200).json({ message: "Server is running" });
});


// Set interval to clean downloads folder every 5 minutes
setInterval(() => {
  console.log("Cleaning downloads directory... after every " + CleaningInterval+"ms");
  cleanDownloadsDir(DOWNLOAD_DIR);
  cleanDownloadsDir(UPLOAD_DIR);
}, CleaningInterval);
// app.post("/process", (req, res) => {
//   const { youtubeUrl, effect } = req.body;
//   const id = uuidv4();
//   const mp3Path = path.join(DOWNLOAD_DIR, `${id}.mp3`);
//   const processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);

//   const ytCmd = `yt-dlp -x --audio-format mp3 -o "${mp3Path}" "${youtubeUrl}"`;
//   exec(ytCmd, (err) => {
//     if (err){console.log(err);
//       return res.status(500).json({ error: "YouTube download failed" });} 

//     if (effect === "slowed_reverb") {
//       const cmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;
//       exec(cmd, (err2) => {
//         if (err2) return res.status(500).json({ error: "FFmpeg effect failed" });
//         return res.json({ downloadSlowedReverbUrl: `/downloads/${id}_processed.mp3` });
//       });
//     } else if (effect === "vocal_remove") {
//       const outputDir = path.join(DOWNLOAD_DIR, id);
//       if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
//      const cmd = `set TORCHAUDIO_AUDIO_BACKEND=soundfile && python -m demucs --two-stems=vocals -o "${DOWNLOAD_DIR}" "${mp3Path}"`;

//       exec(cmd, (err3) => {
//         console.log("Demucs failed",err3)
//         if (err3) return res.status(500).json({ error: "Demucs failed" });
//        const outputFile = path.join(DOWNLOAD_DIR, 'htdemucs', id, 'vocals.wav');
// if (!fs.existsSync(outputFile)) {
//   return res.status(500).json({ error: "Demucs output missing" });
// }
// return res.json({ downloadNoVocalUrl: `/downloads/htdemucs/${id}/no_vocals.wav`,downloadVocalUrl: `/downloads/htdemucs/${id}/no_vocals.wav` });

//       });
//     } else {
//       return res.json({ downloadUrl: `/downloads/${id}.mp3` });
//     }
//   });
// });

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
