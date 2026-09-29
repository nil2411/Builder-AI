import express from 'express';
import "dotenv/config";
import cors from "cors";
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import authRouter from './Routes/authRoutes.js';

const app = express();

connectDB();

app.use(cors({origin : process.env.ORIGINs.split(","),credentials : true}));

app.use(cookieParser());
app.use(express.json);

app.get("/",(req,res) => res.send("server is live !"));

app.use('/api/auth',authRouter)

const Port = process.env.PORT || 3000;

app.use((err,_req,res,_next) =>{
    console.error(`[Error] ${err.message}`);
    return res.status(500).json({success : false,message : "Internal Server Error"});

})

app.listen(Port,() =>{
    console.log(`server is running at https://localhost:${Port}`);
    
})



