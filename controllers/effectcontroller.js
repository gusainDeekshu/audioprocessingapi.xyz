const { exec } = require("child_process");
const { promisify } = require("util");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs"); // for sync exists checks

const execPromise = promisify(exec);
const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");
const UPLOAD_DIR = path.resolve(__dirname, "../uploads");
const COOKIES_FILE_PATH = path.resolve(__dirname, "../config/cookies.txt");

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(cmd) {
  console.log(`[cmd] Executing: ${cmd}`);
  try {
    const { stdout, stderr } = await execPromise(cmd);
    if (stderr) console.warn(`[cmd] stderr: ${stderr}`);
    return stdout;
  } catch (error) {
    console.error(`[cmd] error: ${error.stderr || error.message || error}`);
    throw error;
  }
}

const processVideo = async (req, res) => {
  const youtubeUrl = req.body.youtubeUrl || req.body.url;
  const effect = req.body.effect || req.body.option;
  const uploadedFile = req.file;

  const id = uuidv4();
  let mp3Path;
  await ensureDir(DOWNLOAD_DIR);

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

      await runCommand(ytCmd);

      if (!(await fileExists(mp3Path))) {
        return res.status(500).json({ error: "Downloaded file not found." });
      }
    } else {
      return res.status(400).json({ error: "No input file or URL provided." });
    }

    // Apply effects
    if (effect === "slowed_reverb") {
      const processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);
      const ffmpegCmd = `ffmpeg -y -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;

      await runCommand(ffmpegCmd);

      return res.download(processedPath, () => {
        // Optionally cleanup files after response
        // fs.unlink(processedPath).catch(() => {});
        // if (!uploadedFile) fs.unlink(mp3Path).catch(() => {});
      });
    } 
    
    else if (effect === "vocal_remove") {
      const outputDir = path.join(DOWNLOAD_DIR, "spleeter_output");
      await ensureDir(outputDir);

      const spleeterCmd = `spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;
      await runCommand(spleeterCmd);

      const baseName = path.basename(mp3Path, path.extname(mp3Path));
      const vocalsPath = path.join(outputDir, baseName, "vocals.wav");
      const accompPath = path.join(outputDir, baseName, "accompaniment.wav");

      if (!(await fileExists(accompPath))) {
        return res.status(500).json({ error: "Vocal-free track missing in output." });
      }

      return res.status(200).json({
        downloadVocalUrl: `/downloads/spleeter_output/${baseName}/vocals.wav`,
        downloadNoVocalUrl: `/downloads/spleeter_output/${baseName}/accompaniment.wav`,
      });
    } 
    
    else {
      // No processing, return raw mp3
      return res.download(mp3Path);
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

// Cleans up files in download directory
async function cleanDownloadsDir(downloadDir = DOWNLOAD_DIR) {
  try {
    const files = await fs.readdir(downloadDir, { withFileTypes: true });
    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(downloadDir, file.name);
        if (file.isDirectory()) {
          if (file.name !== "htdemucs") {
            await fs.rm(filePath, { recursive: true, force: true });
          }
        } else {
          await fs.unlink(filePath);
        }
      })
    );
  } catch (err) {
    console.error("Failed to clean downloads directory:", err);
  }
}

module.exports = { processVideo, cleanDownloadsDir };
