const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {VertexAI}=require('@google-cloud/vertexai');

initializeApp();
const db=getFirestore();
const vertex=new VertexAI({project:process.env.GCLOUD_PROJECT,location:'us-central1'});
const model=vertex.getGenerativeModel({model:'gemini-2.0-flash-001',systemInstruction:{parts:[{text:'You are a safe international e-learning mentor. Teach office management, data entry, MS Office, Excel, reporting, graphic design, video editing, digital marketing, programming and AI from Basic to Master. Return practical structured lessons, tasks and tests. Never request secrets. Escalate legal, payment, abuse and security issues to staff.'}]}});

exports.generateLearningContent=onCall({enforceAppCheck:true,region:'us-central1',timeoutSeconds:60,memory:'256MiB'},async request=>{
  if(!request.auth) throw new HttpsError('unauthenticated','Login required.');
  const prompt=String(request.data?.prompt||'').trim();
  if(!prompt||prompt.length>4000) throw new HttpsError('invalid-argument','A prompt of 1-4000 characters is required.');
  const result=await model.generateContent({contents:[{role:'user',parts:[{text:prompt}]}]});
  const text=result.response.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'No response generated.';
  await db.collection('auditLogs').add({uid:request.auth.uid,action:'ai_generation',createdAt:FieldValue.serverTimestamp()});
  return {text};
});

exports.createDailyTask=onSchedule({schedule:'0 0 * * *',timeZone:'UTC',region:'us-central1'},async()=>{
  const users=await db.collection('users').get();
  const batch=db.batch();
  const date=new Date().toISOString().slice(0,10);
  users.forEach(user=>{const ref=user.ref.collection('tasks').doc(date);batch.set(ref,{date,type:'daily',status:'assigned',text:'Complete a 30-minute practical exercise in your selected skill and submit three learning notes.',createdAt:FieldValue.serverTimestamp()},{merge:true});});
  await batch.commit();
});
