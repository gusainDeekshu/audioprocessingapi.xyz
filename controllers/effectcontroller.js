const { exec } = require("child_process");
const { promisify } = require("util");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const execPromise = promisify(exec);
const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");
const UPLOAD_DIR = path.resolve(__dirname, "../uploads");
const COOKIES_FILE_PATH = path.resolve(__dirname, "../config/cookies.txt");

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const processVideo = async (req, res) => {
  const youtubeUrl = req.body.youtubeUrl || req.body.url;
  const effect = req.body.effect || req.body.option;
  const uploadedFile = req.file;

  const id = uuidv4();
  let mp3Path, processedPath;

  // Handle uploaded file or YouTube URL
  if (uploadedFile) {
    mp3Path = uploadedFile.path;
  } else if (youtubeUrl) {
    try {
      new URL(youtubeUrl);
    } catch {
      return res.status(400).json({ error: "Invalid YouTube URL." });
    }

    mp3Path = path.join(DOWNLOAD_DIR, `${id}.mp3`);
    const ytCmd = `yt-dlp --cookies "${COOKIES_FILE_PATH}" --no-check-certificate --no-playlist -x --audio-format mp3 -o "${DOWNLOAD_DIR}/${id}.%(ext)s" "${youtubeUrl}"`;

    try {
      console.log("Running yt-dlp:", ytCmd);
      await execPromise(ytCmd);
    } catch (err) {
      console.error("yt-dlp failed:", err.stderr || err);
      return res.status(500).json({ error: "YouTube download failed." });
    }

    if (!fs.existsSync(mp3Path)) {
      return res.status(500).json({ error: "Downloaded audio not found." });
    }
  } else {
    return res.status(400).json({ error: "No YouTube URL or audio file uploaded." });
  }

  // Apply effects
  if (effect === "slowed_reverb") {
    processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);
    const ffmpegCmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;

    exec(ffmpegCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("FFmpeg error:", stderr);
        return res.status(500).json({ error: "Slowed reverb processing failed." });
      }
      return res.download(processedPath);
    });
  } else if (effect === "vocal_remove") {
    const outputDir = path.join(DOWNLOAD_DIR, "spleeter_output");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const spleeterCmd = `/home/ubuntu/.local/bin/spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;
    // const spleeterCmd = `spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;
    exec(spleeterCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Spleeter error:", stderr);
        return res.status(500).json({ error: "Vocal separation failed." });
      }

      const baseName = path.basename(mp3Path, path.extname(mp3Path));
      const vocalsPath = path.join(outputDir, baseName, "vocals.wav");
      const accompPath = path.join(outputDir, baseName, "accompaniment.wav");

      if (!fs.existsSync(accompPath)) {
        return res.status(500).json({ error: "Spleeter output missing." });
      }

      return res.json({
        downloadVocalUrl: `/downloads/spleeter_output/${baseName}/vocals.wav`,
        downloadNoVocalUrl: `/downloads/spleeter_output/${baseName}/accompaniment.wav`
      });
    });
  } else {
    return res.download(mp3Path);
  }
};
function cleanDownloadsDir(DOWNLOAD_DIR) {
  fs.readdir(DOWNLOAD_DIR, (err, files) => {
    if (err) {
      console.error("Failed to read downloads directory:", err);
      return;
    }
    files.forEach((file) => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Stat error cleaning file:", filePath, err);
          return;
        }
        if (stats.isDirectory()) {
          // Be careful with recursive delete, especially for demucs output
          // For now, let's only delete files and empty dirs if not `htdemucs`
          if (file !== "htdemucs") {
            // Avoid deleting the main demucs output folder
            fs.rm(filePath, { recursive: true, force: true }, (err) => {
              if (err) console.error("Remove dir failed:", filePath, err);
            });
          }
        } else {
          fs.unlink(filePath, (err) => {
            if (err) console.error("Remove file failed:", filePath, err);
          });
        }
      });
      
    });
  });
}

module.exports = { processVideo,cleanDownloadsDir };
