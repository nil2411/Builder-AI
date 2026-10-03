import "dotenv/config";
import jwt from 'jsonwebtoken'

export function authMiddleware(req,res,next){
    const token = req.cookies?.token;

    if(!token){
        return res.status(401).json({error : "Access denied . NO session token provided"});

    }
    
    try {
        const secret = process.env.JWT_SECRET?.trim();
        if (!secret) {
            return res.status(500).json({ error: 'Server authentication is not configured' });
        }
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({error : "session expired or invalid . Please Login again"});
    }

}