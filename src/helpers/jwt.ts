import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';

export const generateToken = (payload: any, secret: Secret, expiresIn: string) => {
    const token = jwt.sign(
        payload,
        secret as Secret,
        {
            algorithm: 'HS256',
            expiresIn: expiresIn 
        } as SignOptions 
    );

    return token;
};

export const verifyToken = (token: string, secret: Secret) => {
    return jwt.verify(token, secret) as JwtPayload;
}

export const jwtHelpers = {
    generateToken,
    verifyToken
}