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

  try {
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

      console.log(`[yt-dlp] Executing: ${ytCmd}`);
      try {
        await execPromise(ytCmd);
      } catch (err) {
        console.error("yt-dlp failed:", err.stderr || err);
        return res.status(500).json({ error: "Failed to download YouTube audio." });
      }

      if (!fs.existsSync(mp3Path)) {
        return res.status(500).json({ error: "Downloaded file not found." });
      }
    } else {
      return res.status(400).json({ error: "No input file or URL provided." });
    }

    // Apply effects
    if (effect === "slowed_reverb") {
      processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);
      const ffmpegCmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;

      console.log(`[ffmpeg] Executing: ${ffmpegCmd}`);
      exec(ffmpegCmd, (err, stdout, stderr) => {
        if (err) {
          console.error("FFmpeg error:", stderr);
          return res.status(500).json({ error: "Audio processing (slowed reverb) failed." });
        }
        return res.download(processedPath);
      });

    } else if (effect === "vocal_remove") {
      const outputDir = path.join(DOWNLOAD_DIR, "spleeter_output");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const spleeterCmd = `/home/ubuntu/.local/bin/spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;
  // const spleeterCmd = `spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;

      console.log(`[spleeter] Executing: ${spleeterCmd}`);
      exec(spleeterCmd, (err, stdout, stderr) => {
        if (err) {
          console.error("Spleeter error:", stderr || err);
          return res.status(500).json({ error: "Vocal separation failed." });
        }

        const baseName = path.basename(mp3Path, path.extname(mp3Path));
        const vocalsPath = path.join(outputDir, baseName, "vocals.wav");
        const accompPath = path.join(outputDir, baseName, "accompaniment.wav");

        if (!fs.existsSync(accompPath)) {
          return res.status(500).json({ error: "Vocal-free track missing in output." });
        }

        return res.status(200).json({
          downloadVocalUrl: `/downloads/spleeter_output/${baseName}/vocals.wav`,
          downloadNoVocalUrl: `/downloads/spleeter_output/${baseName}/accompaniment.wav`,
        });
      });

    } else {
      // No processing, return raw mp3
      return res.download(mp3Path);
    }

  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// Cleans up files in download directory
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
          if (file !== "htdemucs") {
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

module.exports = { processVideo, cleanDownloadsDir };
