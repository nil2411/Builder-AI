import mongoose from "mongoose";
import "dotenv/config";

export async function connectDB(){
    mongoose.connection.on("connected",() =>{
        console.log("Connected to MongoDB");
        
    })

    await mongoose.connect(process.env.MONGODB_URL);
}