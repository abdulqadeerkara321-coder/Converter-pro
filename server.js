
const express=require("express"), multer=require("multer"), fs=require("fs"), path=require("path"), crypto=require("crypto");
const sharp=require("sharp"), {PDFDocument}=require("pdf-lib");
const {execFile}=require("child_process");
const app=express(), PORT=process.env.PORT||3000;
const UP=path.join(__dirname,"uploads"), OUT=path.join(__dirname,"outputs");
fs.mkdirSync(UP,{recursive:true}); fs.mkdirSync(OUT,{recursive:true});
app.use(express.static(path.join(__dirname,"public")));
const upload=multer({dest:UP,limits:{fileSize:100*1024*1024}});
const clean=p=>{try{fs.unlinkSync(p)}catch{}};
const run=(cmd,args)=>new Promise((resolve,reject)=>execFile(cmd,args,{timeout:180000},(e,stdout,stderr)=>e?reject(Error(stderr||e.message)):resolve(stdout)));
const finish=(res,file)=>res.json({download:`/download/${path.basename(file)}`});

app.get("/api/health",(req,res)=>res.json({ok:true,engines:{libreoffice:true,ffmpeg:true,tesseract:true}}));

app.post("/api/image",upload.single("file"),async(req,res)=>{
 try{if(!req.file)throw Error("No file");
 const fmt=["png","jpeg","webp"].includes(req.body.format)?req.body.format:"png", q=Math.max(1,Math.min(100,+req.body.quality||85));
 const ext=fmt==="jpeg"?"jpg":fmt,id=crypto.randomBytes(8).toString("hex"),out=path.join(OUT,`${id}.${ext}`);
 let p=sharp(req.file.path); if(fmt==="png")p=p.png({compressionLevel:9}); if(fmt==="jpeg")p=p.jpeg({quality:q}); if(fmt==="webp")p=p.webp({quality:q});
 await p.toFile(out);clean(req.file.path);finish(res,out);
 }catch(e){if(req.file)clean(req.file.path);res.status(500).json({error:e.message})}
});

app.post("/api/merge-pdf",upload.array("files",20),async(req,res)=>{
 try{const m=await PDFDocument.create();for(const f of req.files){const s=await PDFDocument.load(fs.readFileSync(f.path));(await m.copyPages(s,s.getPageIndices())).forEach(p=>m.addPage(p));clean(f.path)}
 const out=path.join(OUT,crypto.randomBytes(8).toString("hex")+".pdf");fs.writeFileSync(out,await m.save());finish(res,out)
 }catch(e){(req.files||[]).forEach(f=>clean(f.path));res.status(500).json({error:e.message})}
});

async function libreConvert(file,ext){
 const dir=path.join(OUT,crypto.randomBytes(8).toString("hex"));fs.mkdirSync(dir);
 await run("libreoffice",["--headless","--convert-to",ext,"--outdir",dir,file]);
 const files=fs.readdirSync(dir);if(!files.length)throw Error("LibreOffice conversion failed");
 const out=path.join(OUT,files[0]);fs.renameSync(path.join(dir,files[0]),out);fs.rmSync(dir,{recursive:true,force:true});return out;
}
app.post("/api/office",upload.single("file"),async(req,res)=>{
 try{if(!req.file)throw Error("No file");const type=req.body.type;
 const ext=type==="word-pdf"?"pdf":type==="excel-pdf"?"pdf":type==="ppt-pdf"?"pdf":type==="pdf-word"?"docx":null;
 if(!ext)throw Error("Unsupported conversion");const out=await libreConvert(req.file.path,ext);clean(req.file.path);finish(res,out)
 }catch(e){if(req.file)clean(req.file.path);res.status(500).json({error:"Office engine error: "+e.message})}
});

app.post("/api/media",upload.single("file"),async(req,res)=>{
 try{if(!req.file)throw Error("No file");const type=req.body.type,id=crypto.randomBytes(8).toString("hex");
 const ext=type==="video-mp3"?"mp3":type==="video-wav"?"wav":type==="audio-mp3"?"mp3":type==="video-mp4"?"mp4":null;
 if(!ext)throw Error("Unsupported media conversion");const out=path.join(OUT,`${id}.${ext}`);
 let args=type==="video-mp3"?["-y","-i",req.file.path,"-vn","-codec:a","libmp3lame",out]:
 type==="video-wav"?["-y","-i",req.file.path,"-vn",out]:
 type==="audio-mp3"?["-y","-i",req.file.path,out]:
 ["-y","-i",req.file.path,"-c:v","libx264","-c:a","aac",out];
 await run("ffmpeg",args);clean(req.file.path);finish(res,out)
 }catch(e){if(req.file)clean(req.file.path);res.status(500).json({error:"FFmpeg error: "+e.message})}
});

app.post("/api/ocr",upload.single("file"),async(req,res)=>{
 try{if(!req.file)throw Error("No file");const id=crypto.randomBytes(8).toString("hex"),out=path.join(OUT,id);
 await run("tesseract",[req.file.path,out,"-l",req.body.lang||"eng"]);clean(req.file.path);res.json({download:`/download/${id+".txt"}`})
 }catch(e){if(req.file)clean(req.file.path);res.status(500).json({error:"OCR error: "+e.message})}
});
app.get("/download/:name",(req,res)=>{const f=path.join(OUT,path.basename(req.params.name));if(!fs.existsSync(f))return res.sendStatus(404);res.download(f,()=>clean(f))});
app.listen(PORT,()=>console.log(`Converter Pro v4: http://localhost:${PORT}`));
