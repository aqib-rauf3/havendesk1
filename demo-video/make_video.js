import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TTS_SCRIPT = path.join(__dirname, 'tts.ps1');
const BGM_PATH = 'C:\\Users\\LENOVO\\.gemini\\antigravity\\scratch\\test-video\\bgm_full.mp3';
const FONT_PATH = path.join(ROOT_DIR, 'arial.ttf');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Ensure arial.ttf exists in project root for ffmpeg font lookup
if (!fs.existsSync(FONT_PATH)) {
  fs.copyFileSync('C:\\Windows\\Fonts\\arial.ttf', FONT_PATH);
}

const SCENES = [
  {
    id: 'scene1_crisis',
    title: 'THE 45 PERCENT REVENUE DRAIN',
    subtitle: 'Why Local Service Businesses Lose Thousands Every Week to Voicemail',
    line1: '62% of calls after 5:00 PM and on weekends go unanswered to voicemail',
    line2: 'In high-ticket niches like Roofing & Dental, callers dial competitors in 60s',
    line3: 'Average revenue lost per missed emergency lead: $8,500 to $24,000',
    color: '0x0b1120',
    narration: "Every single week, local contractors, dentists, and home service providers lose thousands of dollars in high-ticket jobs simply because no one answers the phone after hours, during busy jobs, or on weekends. Sixty-two percent of callers will not leave a voicemail. They immediately hang up and call the next business on Google."
  },
  {
    id: 'scene2_havendesk',
    title: 'MEET HAVENDESK',
    subtitle: 'The 24/7 Autonomous AI Receptionist for Phone, WhatsApp & Web',
    line1: 'PHONE: Natural voice AI with sub-800ms response time and emergency triage',
    line2: 'WHATSAPP & WEB: Instant damage photo intake and insurance verification',
    line3: 'AUTOMATION: Direct scheduling into Google Calendar and integrated CRM',
    color: '0x0a192f',
    narration: "Meet HavenDesk. A calm, intelligent AI receptionist built specifically for local service businesses. HavenDesk answers every phone call in under eight hundred milliseconds, chats with customers on WhatsApp and your website, and schedules appointments directly into your calendar twenty-four hours a day, three hundred and sixty-five days a year."
  },
  {
    id: 'scene3_live_emergency',
    title: 'LIVE TRIAGE: SATURDAY 8:45 PM',
    subtitle: 'From Panicked Emergency Call to Dispatched Crew in Under 45 Seconds',
    line1: '1. Inbound Voice: Homeowner reports water pouring through living room ceiling',
    line2: '2. Autonomous Triage: Recognizes high emergency, calms caller, alerts on-call crew',
    line3: '3. WhatsApp Follow-Up: Collects damage photos and locks $12,000 emergency repair',
    color: '0x0f172a',
    narration: "Here is HavenDesk in action. It is Saturday evening at eight forty-five P M. A panicked homeowner calls with water pouring through their ceiling. HavenDesk answers instantly, recognizes the emergency, immediately alerts the on-call crew, and texts the customer on WhatsApp to securely upload damage photos. In under forty-five seconds, an emergency assessment is locked into the schedule, converting a missed lead into a twelve thousand dollar job."
  },
  {
    id: 'scene4_owner_view',
    title: 'THE OWNER DASHBOARD',
    subtitle: 'Total Operational Clarity: 8:00 AM Morning Briefing & Instant CRM Sync',
    line1: '8:00 AM Briefing: Automated executive daily digest of leads, calls & bookings',
    line2: 'Unified CRM: Full transcripts, recordings, caller history & photo attachments',
    line3: 'Proven ROI: Saves 24 hours of admin time per month and captures 100% of leads',
    color: '0x062024',
    narration: "When you wake up Monday morning, your HavenDesk portal has already done the heavy lifting. The eight A M executive briefing delivers every lead and booking straight to your phone. Transcripts, audio recordings, and customer history are neatly organized in your CRM, giving you total peace of mind while saving over twenty hours of administrative work each month."
  },
  {
    id: 'scene5_trial_cta',
    title: 'LIVE IN UNDER 5 MINUTES',
    subtitle: 'Never Lose Another High-Value Customer to Voicemail Again',
    line1: 'Zero Hardware Required: Seamlessly connects to your existing phone line',
    line2: 'Transparent Pricing: Starter, Growth, and Pro tiers from $199 per month',
    line3: '14-Day Free Trial: Set up your receptionist today — no credit card needed',
    color: '0x081a20',
    narration: "Setup takes less than five minutes with zero hardware required. It seamlessly connects to your existing phone line, WhatsApp, and Google Calendar. Try HavenDesk free for fourteen days with no credit card required to start. Visit HavenDesk dot com today and turn every missed call into captured revenue."
  }
];

function sanitizeForFfmpeg(str) {
  return str.replace(/%/g, ' percent').replace(/['":\\$]/g, '');
}

console.log('🚀 Starting HavenDesk Client Demo Video Generation (1080p Full HD)...');

const sceneClips = [];

for (let i = 0; i < SCENES.length; i++) {
  const scene = SCENES[i];
  console.log(`\n🎙️ Processing Scene ${i + 1}/${SCENES.length}: ${scene.title}`);

  // 1. Generate Voiceover WAV using PowerShell System.Speech via execFileSync
  const wavPath = path.join(TEMP_DIR, `${scene.id}.wav`);
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', TTS_SCRIPT,
    wavPath,
    scene.narration
  ]);

  // 2. Measure Audio Duration with ffprobe
  const durOutput = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wavPath}"`).toString().trim();
  const audioDuration = parseFloat(durOutput);
  const sceneDuration = Math.ceil(audioDuration + 1.2);
  console.log(`   Audio duration: ${audioDuration.toFixed(2)}s -> Scene total: ${sceneDuration}s`);

  // 3. Build Ffmpeg Drawtext Filter Graph with HavenDesk brand palette
  const title = sanitizeForFfmpeg(scene.title);
  const sub = sanitizeForFfmpeg(scene.subtitle);
  const l1 = sanitizeForFfmpeg(scene.line1);
  const l2 = sanitizeForFfmpeg(scene.line2);
  const l3 = sanitizeForFfmpeg(scene.line3);

  const filter = [
    `drawtext=fontfile=arial.ttf:text='${title}':fontcolor=0x14b8a6:fontsize=56:x=(w-text_w)/2:y=180`,
    `drawtext=fontfile=arial.ttf:text='${sub}':fontcolor=0x94a3b8:fontsize=28:x=(w-text_w)/2:y=270`,
    `drawbox=x=180:y=360:w=1560:h=480:color=0x1e293b@0.75:t=fill`,
    `drawtext=fontfile=arial.ttf:text='${l1}':fontcolor=0xf8fafc:fontsize=36:x=230:y=430`,
    `drawtext=fontfile=arial.ttf:text='${l2}':fontcolor=0xf8fafc:fontsize=36:x=230:y=550`,
    `drawtext=fontfile=arial.ttf:text='${l3}':fontcolor=0x2dd4bf:fontsize=36:x=230:y=670`,
    `drawtext=fontfile=arial.ttf:text='HavenDesk | 24/7 Autonomous AI Receptionist':fontcolor=0x64748b:fontsize=22:x=(w-text_w)/2:y=960`
  ].join(',');

  const clipPath = path.join(TEMP_DIR, `${scene.id}.mp4`);
  const ffmpegCmd = `ffmpeg -y -f lavfi -i color=c=${scene.color}:s=1920x1080:d=${sceneDuration}:r=30 -i "${wavPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${clipPath}"`;
  
  execSync(ffmpegCmd, { cwd: ROOT_DIR });
  sceneClips.push(clipPath);
}

// 4. Create Concat List File
console.log('\n🎬 Concatenating all scenes...');
const concatListPath = path.join(TEMP_DIR, 'concat_list.txt');
const listContent = sceneClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
fs.writeFileSync(concatListPath, listContent);

const concatenatedVideo = path.join(TEMP_DIR, 'video_no_bgm.mp4');
execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedVideo}"`);

// 5. Mix Background Music (BGM) under speech at -20dB with audio filter
console.log('🎵 Mixing soft background music...');
const finalOutput = path.join(OUTPUT_DIR, 'havendesk_client_demo.mp4');

const totalDur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${concatenatedVideo}"`).toString().trim();
const totalSeconds = parseFloat(totalDur);

const mixCmd = `ffmpeg -y -i "${concatenatedVideo}" -i "${BGM_PATH}" -filter_complex "[1:a]volume=0.10,afade=t=out:st=${(totalSeconds - 2).toFixed(1)}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k "${finalOutput}"`;

execSync(mixCmd);

console.log('\n============================================================');
console.log(`✅ SUCCESS! HavenDesk High-Definition Client Demo Video Created:`);
console.log(`📁 File: ${finalOutput}`);
console.log(`⏱️ Duration: ${totalSeconds.toFixed(1)} seconds`);
console.log(`🖥️ Resolution: 1920x1080 Full HD with natural narration & BGM`);
console.log('============================================================\n');
