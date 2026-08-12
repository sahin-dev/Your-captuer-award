const { PrismaClient } = require('./src/prismaClient'
const client = new PrismaClient(); 
const userId = '6a1fb4b12928bb1ee5671b4d'; 
async function main(){ 
  const user = await client.user.findUnique({ where: { id: userId }, include: { level: true } }); 
  console.log('USER:', JSON.stringify(user, null, 2)); 
  const parts = await client.contestParticipant.findMany({ where: { userId }, select: { id: true, contestId: true, level: true } }); 
  console.log('PARTICIPANTS:', JSON.stringify(parts, null, 2)); 
  await client.(); 
} 
main().catch(async e = console.error(e); await client.(); process.exit(1); }); 
