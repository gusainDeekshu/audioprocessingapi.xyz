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
    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Stat error cleaning file:", filePath, err);
          return;
        }
        if (stats.isDirectory()) {
          // Be careful with recursive delete, especially for demucs output
          // For now, let's only delete files and empty dirs if not `htdemucs`
          if (file !== 'htdemucs') { // Avoid deleting the main demucs output folder
            fs.rm(filePath, { recursive: true, force: true }, err => {
              if (err) console.error("Remove dir failed:", filePath, err);
            });
          }
        } else {
          fs.unlink(filePath, err => {
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
    console.error(`Cookies file not found at: ${COOKIES_FILE_PATH}. YouTube downloads may fail for age-restricted or login-required videos.`);
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
         return res.status(401).json({ error: "YouTube download failed. Video may require login or cookies are invalid/expired." });
      }
      return res.status(500).json({ error: "YouTube download failed. Please check server logs." });
    }
    console.log("yt-dlp stdout:", stdout); // Log stdout

    if (!fs.existsSync(mp3Path)) {
        console.error(`Downloaded mp3 file not found at: ${mp3Path} after yt-dlp success.`);
        return res.status(500).json({ error: "Downloaded audio file not found. yt-dlp might have had an issue." });
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
            console.error(`Processed mp3 file not found at: ${processedPath} after ffmpeg success.`);
            return res.status(500).json({ error: "Processed audio file not found." });
        }
        return res.json({ downloadSlowedReverbUrl: `/downloads/${id}_processed.mp3` });
      });
    } else if (effect === "vocal_remove") {
      // Demucs output path is relative to where it's run, or with -o
      // The default output for `python -m demucs --two-stems=vocals -o "output_dir" "input_file.mp3"`
      // will be `output_dir/htdemucs/input_file_basename/vocals.wav` and `no_vocals.wav`
      const demucsOutputDir = path.join(DOWNLOAD_DIR, "htdemucs_output"); // A general output dir for demucs
      const specificDemucsOutputPath = path.join(demucsOutputDir, 'htdemucs', id); // Demucs creates a subfolder with the model name, then input basename
      const noVocalsFile = path.join(specificDemucsOutputPath, 'no_vocals.wav');
      const vocalsFile = path.join(specificDemucsOutputPath, 'vocals.wav');

      // Note: The -o for demucs specifies the *parent* directory for its 'htdemucs' output folder.
      const cmd = `python3 -m demucs --two-stems=vocals -o "${demucsOutputDir}" "${mp3Path}"`;
      console.log("Executing Demucs command:", cmd);

      exec(cmd, (err3, demucsStdout, demucsStderr) => {
        if (err3) {
          console.error("Demucs error:", err3);
          console.error("Demucs stderr:", demucsStderr);
          return res.status(500).json({ error: "Demucs processing failed" });
        }
        console.log("Demucs stdout:", demucsStdout);

        // Check if the expected output files exist
        if (!fs.existsSync(vocalsFile) || !fs.existsSync(noVocalsFile)) {
          console.error("Demucs output missing. Expected:", vocalsFile, "and", noVocalsFile);
          console.error("Demucs stderr:", demucsStderr); // Demucs might have outputted to a different location or failed silently.
          // You might want to list directory contents here for debugging:
          // try {
          //   const filesInDemucsDir = fs.readdirSync(specificDemucsOutputPath);
          //   console.log(`Files in ${specificDemucsOutputPath}:`, filesInDemucsDir);
          // } catch (e) { console.error("Could not read demucs output dir", e); }
          return res.status(500).json({ error: "Demucs output files not found. Processing might have failed." });
        }
        return res.json({
          // Construct URL relative to the demucsOutputDir and its subpaths
          downloadNoVocalUrl: `/downloads/htdemucs_output/htdemucs/${id}/no_vocals.wav`,
          downloadVocalUrl: `/downloads/htdemucs_output/htdemucs/${id}/vocals.wav`,
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