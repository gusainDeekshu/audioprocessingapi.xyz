const {Router}=require('express')
const { processVideo } = require('../controllers/effectcontroller');


const router=Router();

router.post("/process",processVideo);


module.exports=router;