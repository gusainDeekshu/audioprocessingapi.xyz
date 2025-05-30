const { exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const processVideo = async (req, res) => {
  const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");
  const COOKIES_PATH = "cookies.txt"; // Update if stored elsewhere
  const { youtubeUrl, effect } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: "youtubeUrl is required" });
  }

  const id = uuidv4();
  const mp3Path = path.join(DOWNLOAD_DIR, `${id}.mp3`);
  const processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);

  // Note the use of .%(ext)s to allow yt-dlp to determine the correct extension
  const ytCmd = `yt-dlp --cookies ${COOKIES_PATH} -x --audio-format mp3 -o "${DOWNLOAD_DIR}/${id}.%(ext)s" "${youtubeUrl}"`;

  exec(ytCmd, (err) => {
    if (err) {
      console.log("yt-dlp error:", err);
      return res.status(500).json({ error: "YouTube download failed" });
    }

    if (effect === "slowed_reverb") {
      const cmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;
      exec(cmd, (err2) => {
        console.log("slowed_reverb:", err2);

        if (err2) return res.status(500).json({ error: "FFmpeg effect failed" });
        return res.json({ downloadSlowedReverbUrl: `/downloads/${id}_processed.mp3` });
      });
    } else if (effect === "vocal_remove") {
      const outputDir = path.join(DOWNLOAD_DIR, id);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
     const cmd = `set TORCHAUDIO_AUDIO_BACKEND=soundfile && python -m demucs --two-stems=vocals -o "${DOWNLOAD_DIR}" "${mp3Path}"`;

      exec(cmd, (err3) => {
        console.log("Demucs failed",err3)
        if (err3) return res.status(500).json({ error: "Demucs failed" });
       const outputFile = path.join(DOWNLOAD_DIR, 'htdemucs', id, 'vocals.wav');
if (!fs.existsSync(outputFile)) {
  return res.status(500).json({ error: "Demucs output missing" });
}
return res.json({ downloadNoVocalUrl: `/downloads/htdemucs/${id}/no_vocals.wav`,downloadVocalUrl: `/downloads/htdemucs/${id}/vocals.wav` });

      });
    } else {
      return res.json({ downloadUrl: `/downloads/${id}.mp3` });
    }
  });
};

module.exports = {
  processVideo,
};
