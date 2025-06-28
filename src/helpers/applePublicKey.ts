import { JwksClient } from "jwks-rsa";

const client = new JwksClient({
    jwksUri: 'https://appleid.apple.com/auth/keys',
  })


  export const getApplePublicKey =  (kid:string)=>{

    return new Promise((resolve, reject) => {

      client.getSigningKey(kid, (err, key) => {

        if (err) return reject(err);
        const signingKey = key?.getPublicKey();
        resolve(signingKey);
      });
    });
  }