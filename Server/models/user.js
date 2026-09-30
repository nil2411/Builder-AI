import mongoose, {Schema} from "mongoose";
import bcrypt from 'bcrypt';


const UserSchema = new Schema({
    name : {type : String, required : true},
    email : {type : String, required : true, unique : true, lowercase : true, trim : true},
    password : {type : String, required : true},

    
},{timestamps : true});

//Hash passowrd

UserSchema.pre('save', async function(){
    if(!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
})

//compare password

UserSchema.methods.comparePassword = async function(password){
    return await bcrypt.compare(password, this.password);
}

export const User = mongoose.model('User', UserSchema);