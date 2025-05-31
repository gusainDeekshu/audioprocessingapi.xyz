const {Router}=require('express')
const { processVideo } = require('../controllers/effectcontroller');
const multer = require("multer");

const router=Router();
// File upload middleware
const upload = multer({ dest: "downloads/uploads" });
router.post("/process",upload.single("file"),processVideo);


module.exports=router;