const { exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");
// Define the path to your cookies file
// IMPORTANT: Update this path to where you've stored cookies.txt on your server
const COOKIES_FILE_PATH = path.resolve(__dirname, "../config/cookies.txt"); // Example path

// Ensure the downloads directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
// Ensure the config directory (for cookies) exists if you plan to put it there
const configDir = path.dirname(COOKIES_FILE_PATH);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

function cleanDownloadsDir() {
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

const processVideo = async (req, res) => {
  const { youtubeUrl, effect } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: "youtubeUrl is required" });
  }

  // Basic URL validation (can be improved)
  try {
    new URL(youtubeUrl);
  } catch (e) {
    return res.status(400).json({ error: "Invalid youtubeUrl format" });
  }

  const id = uuidv4();
  const mp3Path = path.join(DOWNLOAD_DIR, `${id}.mp3`);
  const processedPath = path.join(DOWNLOAD_DIR, `${id}_processed.mp3`);

  // Check if cookies file exists
  if (!fs.existsSync(COOKIES_FILE_PATH)) {
    console.error(
      `Cookies file not found at: ${COOKIES_FILE_PATH}. YouTube downloads may fail for age-restricted or login-required videos.`
    );
    // Decide if you want to fail here or let yt-dlp try without cookies
    // return res.status(500).json({ error: "Server configuration error: Cookies file missing." });
  }

  // Add --cookies option. Also add --no-check-certificate for potential SSL issues on some servers,
  // and --ignore-errors to try and continue if some formats fail but an audio can still be extracted.
  // Adding --no-playlist in case a URL points to a video within a playlist.
  const ytCmd = `yt-dlp --cookies "${COOKIES_FILE_PATH}" --no-check-certificate --no-playlist -x --audio-format mp3 -o "${DOWNLOAD_DIR}/${id}.%(ext)s" "${youtubeUrl}"`;

  console.log("Executing yt-dlp command:", ytCmd); // Log the command

  exec(ytCmd, (err, stdout, stderr) => {
    if (err) {
      console.error("yt-dlp error:", err);
      console.error("yt-dlp stderr:", stderr); // Log stderr for more details
      // Check stderr for specific messages
      if (stderr && stderr.includes("Sign in to confirm")) {
        return res
          .status(401)
          .json({
            error:
              "YouTube download failed. Video may require login or cookies are invalid/expired.",
          });
      }
      return res
        .status(500)
        .json({ error: "YouTube download failed. Please check server logs." });
    }
    console.log("yt-dlp stdout:", stdout); // Log stdout

    if (!fs.existsSync(mp3Path)) {
      console.error(
        `Downloaded mp3 file not found at: ${mp3Path} after yt-dlp success.`
      );
      return res
        .status(500)
        .json({
          error:
            "Downloaded audio file not found. yt-dlp might have had an issue.",
        });
    }

    if (effect === "slowed_reverb") {
      const cmd = `ffmpeg -i "${mp3Path}" -filter_complex "atempo=0.85,aecho=0.8:0.9:1000:0.3" "${processedPath}"`;
      console.log("Executing FFmpeg command:", cmd);
      exec(cmd, (err2, ffmpegStdout, ffmpegStderr) => {
        if (err2) {
          console.error("FFmpeg error:", err2);
          console.error("FFmpeg stderr:", ffmpegStderr);
          return res.status(500).json({ error: "FFmpeg effect failed" });
        }
        console.log("FFmpeg stdout:", ffmpegStdout);
        if (!fs.existsSync(processedPath)) {
          console.error(
            `Processed mp3 file not found at: ${processedPath} after ffmpeg success.`
          );
          return res
            .status(500)
            .json({ error: "Processed audio file not found." });
        }
        return res.json({
          downloadSlowedReverbUrl: `/downloads/${id}_processed.mp3`,
        });
      });
    }else if (effect === "vocal_remove") {
  const outputDir = path.join(DOWNLOAD_DIR, "spleeter_output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // for locals const cmd = `spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;
const cmd = `/home/ubuntu/.local/bin/spleeter separate -p spleeter:2stems -o "${outputDir}" "${mp3Path}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("Spleeter error:", err);
      console.error(stderr);
      return res.status(500).json({ error: "Spleeter processing failed" });
    }

    console.log("Spleeter output:", stdout);

    const id = path.basename(mp3Path, path.extname(mp3Path));
    const vocalsPath = path.join(outputDir, id, "vocals.wav");
    const accompanimentPath = path.join(outputDir, id, "accompaniment.wav");

    if (!fs.existsSync(vocalsPath) || !fs.existsSync(accompanimentPath)) {
      return res.status(500).json({ error: "Spleeter output files missing" });
    }

    return res.json({
      downloadVocalUrl: `/downloads/spleeter_output/${id}/vocals.wav`,
      downloadNoVocalUrl: `/downloads/spleeter_output/${id}/accompaniment.wav`,
    });
  });
} else {
      return res.json({ downloadUrl: `/downloads/${id}.mp3` });
    }
  });
};

module.exports = {
  processVideo,
  cleanDownloadsDir,
};
