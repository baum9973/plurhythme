/* ===== 定数（ユーザーごとに変わらないもの）===== */
const canvasLogicalWidth = 1920;
const canvasLogicalHeight = 1080;
// link を空にすると「<キー>がありません」を出して続行する（画像は枠線、音声はスキップ）
const audioFiles = Object.freeze({
  titlebgm: { link: "" }, resultbgm: { link: "" }, song1: { link: "" },
  buttonclick: { link: "" }, hitperfect: { link: "" }, hitgood: { link: "" }, hitmiss: { link: "" },
});
const imageFiles = Object.freeze({
  load1: { link: "" }, load2: { link: "" }, titleimg: { link: "" }, titlelogo: { link: "" },
  startbutton: { link: "" }, playbutton: { link: "" }, returnbutton: { link: "" }, retrybutton: { link: "" },
  maincharacter_back: { link: "" }, maincharacter_front: { link: "" },
});
const loadingAnimationImageKeys = Object.freeze(["load1", "load2"]);
const loadingSwitchIntervalMilliseconds = 150;
const difficultyNames = Object.freeze(["easy", "normal", "hard"]);
const noteTypes = Object.freeze({ meterChange: 0, tap: 1, guide: 2, soundShard: 3, damage: 4 });
const judgeNames = Object.freeze(["PERFECT", "GOOD", "MISS"]);
const judgeWidthMilliseconds = Object.freeze([50, 120, 120]);
const judgeScoreRatios = Object.freeze({ PERFECT: 1, GOOD: 0.5, MISS: 0 });
const rankBorders = Object.freeze({ SS: 975000, S: 950000, A: 900000, B: 800000, C: 700000, D: 0 });
const fullScore = 1000000;
const maximumHitPoints = 100;
const hitPointsLostOnMiss = 5;
const hitPointsLostOnDamage = 5;
const hitPointsRecoveryPerCombo = 0.1;
const soundShardCollectWindowMilliseconds = 120;
const damageTouchWindowMilliseconds = 120;
const soundShardRewardMultiple = 100;
const soundShardRewardExponent = 1;
const judgeLineYPercent = 80;
const laneFarEndYPercent = 0;
const guideBandWidthRatio = 0.3;
const laneMoveDurationMilliseconds = 100;
const readyDisplayMilliseconds = 500;
const goDisplayMilliseconds = 500;
const countdownStepMilliseconds = 1000;
const countdownStepCount = 3;
const resultEffectDelayMilliseconds = 1000;
const resultEffectDisplayMilliseconds = 1000;
const resultFadeOutMilliseconds = 500;
const lookAheadBaseMilliseconds = 12000; // 仮: 落下速度1.00のとき、ノーツが出てから判定ラインに届くまで
let storageKeyPrefix = "plurythme_guest_";
const defaultKeyBindings = Object.freeze({
  moveLeft: ["arrowleft", "a"], moveRight: ["arrowright", "d"], hit: ["arrowup", "arrowdown", "w", "s"],
});
const defaultSettings = Object.freeze({
  noteFallSpeed: 9.0, farLaneWidthRatio: 0.8, accelerationExponent: 1, laneWidthAtJudgeLine: 300,
  guideOpacityPercent: 80, comboPositionXPercent: 80, comboPositionYPercent: 40, judgeOffsetMilliseconds: 0,
});
const settings = Object.assign({}, defaultSettings);

/* ===== 譜面データ ===== */
// サンプル譜面: 4分音符を16小節、レーンは 0 → -1 → 0 → 1 の繰り返し（全64ノーツ）
function createSampleChart() {
  const laneSequence = [0, -1, 0, 1];
  const chart = [];
  for (let bar = 1; bar <= 16; bar++) {
    for (let beat = 1; beat <= 4; beat++) {
      chart.push({ bar: bar, beat: beat, type: noteTypes.tap, lane: laneSequence[beat - 1] });
    }
  }
  return chart;
}
const songs = Object.freeze({
  song1: {
    title: "サンプル曲", bpm: 160, meter: "4/4", laneCount: 3, offsetMilliseconds: 0,
    easy: { difficulty: 1, chart: createSampleChart() },
    normal: { difficulty: 5, chart: createSampleChart() },
    hard: { difficulty: 9.5, chart: createSampleChart() },
  },
});
const songKeys = Object.keys(songs);

/* ===== 共通: 描画の準備と保存 =====
   保存: localStorage に JSON で入れる（キーは接頭辞つき）。読み書きはこの2関数だけを通す */
const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });
const loadedImages = {};
const loadedAudio = {};
const reportedMissingKeys = {};
let currentScene = "loading";
let buttonList = [];
let nextButtonList = [];
let currentMusic = null;

function saveStoredValue(name, value) {
  try { localStorage.setItem(storageKeyPrefix + name, JSON.stringify(value)); } catch (error) { console.log("保存できませんでした"); }
}
function loadStoredValue(name, fallbackValue) {
  try {
    const text = localStorage.getItem(storageKeyPrefix + name);
    return text === null ? fallbackValue : JSON.parse(text);
  } catch (error) { return fallbackValue; }
}
function reportMissingKey(key) {
  if (reportedMissingKeys[key]) return;
  reportedMissingKeys[key] = true;
  console.log("<" + key + ">がありません");
}

/* ===== 素材の読み込み =====
   全キーを順に読み込み、リンクなし・失敗はログだけ出して「読み込み済み」に数える。全部終わったら isLoadingFinished を立てる */
let isLoadingFinished = false;
function startLoadingAssets() {
  const imageKeys = Object.keys(imageFiles);
  const audioKeys = Object.keys(audioFiles);
  let remainingCount = imageKeys.length + audioKeys.length;
  const finishOne = function () {
    remainingCount--;
    if (remainingCount <= 0) isLoadingFinished = true;
  };
  for (let index = 0; index < imageKeys.length; index++) {
    const key = imageKeys[index];
    if (!imageFiles[key].link) { reportMissingKey(key); finishOne(); continue; }
    const image = new Image();
    image.onload = function () { loadedImages[key] = image; finishOne(); };
    image.onerror = function () { reportMissingKey(key); finishOne(); };
    image.src = imageFiles[key].link;
  }
  for (let index = 0; index < audioKeys.length; index++) {
    const key = audioKeys[index];
    if (!audioFiles[key].link) { reportMissingKey(key); finishOne(); continue; }
    const audio = new Audio(audioFiles[key].link);
    audio.addEventListener("canplaythrough", function () { loadedAudio[key] = audio; finishOne(); }, { once: true });
    audio.addEventListener("error", function () { reportMissingKey(key); finishOne(); }, { once: true });
  }
}
function getImage(key) {
  if (!loadedImages[key]) reportMissingKey(key);
  return loadedImages[key] || null;
}
function playSoundEffect(key, volumePercent) {
  if (!loadedAudio[key]) { reportMissingKey(key); return; }
  applyAudioVolume(loadedAudio[key], volumePercent === undefined ? settings.systemSeVolume : volumePercent);
  loadedAudio[key].currentTime = 0;
  loadedAudio[key].play().catch(function () {});
}
function startBackgroundMusic(key) {
  stopBackgroundMusic();
  if (!loadedAudio[key]) { reportMissingKey(key); return; }
  currentMusic = loadedAudio[key];
  applyAudioVolume(currentMusic, settings.systemBgmVolume);
  currentMusic.loop = true;
  currentMusic.currentTime = 0;
  currentMusic.play().catch(function () {});
}
function stopBackgroundMusic() {
  if (currentMusic) currentMusic.pause();
  currentMusic = null;
}

/* ===== 画面部品 =====
   ボタン: 描画のたびに nextButtonList へ登録し、次のフレームでクリック判定に使う。画像がなければ枠線と文字で代用 */
function drawText(text, x, y, size, align, color) {
  context.font = "bold " + size + "px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  context.textAlign = align || "left";
  context.textBaseline = "middle";
  context.fillStyle = color || "#ffffff";
  context.fillText(text, x, y);
}
function drawButton(label, x, y, width, height, imageKey, onClick) {
  const image = imageKey ? getImage(imageKey) : null;
  if (image) {
    context.drawImage(image, x, y, width, height);
  } else {
    context.fillStyle = "rgba(20, 40, 70, 0.8)";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#7fd8ff";
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    drawText(label, x + width / 2, y + height / 2, Math.min(44, height * 0.5), "center");
  }
  nextButtonList.push({ x: x, y: y, width: width, height: height, onClick: onClick });
}
function drawImageOrFrame(key, x, y, width, height) {
  const image = getImage(key);
  if (image) { context.drawImage(image, x, y, width, height); return; }
  context.strokeStyle = "#7fd8ff";
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);
}
function convertToLogicalPoint(clientX, clientY) {
  const rectangle = canvas.getBoundingClientRect();
  const scale = Math.min(rectangle.width / canvasLogicalWidth, rectangle.height / canvasLogicalHeight);
  const offsetX = (rectangle.width - canvasLogicalWidth * scale) / 2;
  const offsetY = (rectangle.height - canvasLogicalHeight * scale) / 2;
  return { x: (clientX - rectangle.left - offsetX) / scale, y: (clientY - rectangle.top - offsetY) / scale };
}
canvas.addEventListener("pointerdown", function (event) {
  const point = convertToLogicalPoint(event.clientX, event.clientY);
  for (let index = buttonList.length - 1; index >= 0; index--) {
    const button = buttonList[index];
    if (point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) {
      playSoundEffect("buttonclick");
      button.onClick();
      return;
    }
  }
});

/* ===== ローディング画面 =====
   読み込み中は右下に loadingAnimationImageKeys の画像を一定間隔で切り替えて表示。
   完了したら「次へ」ボタンを出し、押したらタイトルへ（BGMの自動再生制限への対策） */
function drawLoadingScene(nowMilliseconds) {
  context.fillStyle = "#0b1020";
  context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  drawText("Plurythme", 960, 440, 96, "center");
  const frameIndex = Math.floor(nowMilliseconds / loadingSwitchIntervalMilliseconds) % loadingAnimationImageKeys.length;
  drawImageOrFrame(loadingAnimationImageKeys[frameIndex], 1620, 780, 240, 240);
  if (!isLoadingFinished) { drawText("Now Loading...", 960, 600, 48, "center"); return; }
  drawButton("次へ", 760, 560, 400, 110, null, function () { startBackgroundMusic("titlebgm"); currentScene = "title"; });
}

/* ===== タイトル画面 =====
   titleimg を余白が出ない大きさに拡大して左上から描く。ロゴは中央・上から25%、横幅は画面の半分 */
function drawTitleScene() {
  const image = getImage("titleimg");
  if (image) {
    const scale = Math.max(canvasLogicalWidth / image.width, canvasLogicalHeight / image.height);
    context.drawImage(image, 0, 0, image.width * scale, image.height * scale);
  } else {
    context.fillStyle = "#101a3a";
    context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  }
  const logo = getImage("titlelogo");
  if (logo) {
    const logoWidth = canvasLogicalWidth / 2;
    context.drawImage(logo, (canvasLogicalWidth - logoWidth) / 2, canvasLogicalHeight * 0.25, logoWidth, logoWidth * logo.height / logo.width);
  } else {
    drawText("Plurythme", 960, canvasLogicalHeight * 0.25, 140, "center");
  }
  drawButton("はじめる", 760, 700, 400, 120, "startbutton", startFromTitle);
}

/* ===== 曲選択画面 =====
   ↑↓で曲、←→で難易度を選ぶ（クリックでも可）。選択中の曲は少し大きく表示。ハイスコアは保存データから表示 */
let selectedSongIndex = 0;
let selectedDifficultyIndex = 0;
function getHighScoreEntry(songKey, difficultyName) {
  return loadStoredValue("highScores", {})[songKey + "_" + difficultyName] || null;
}
function drawSongSelectScene() {
  context.fillStyle = "#0b1020";
  context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  for (let index = 0; index < songKeys.length; index++) {
    const isSelected = index === selectedSongIndex;
    const rowHeight = isSelected ? 120 : 90;
    const rowIndex = index;
    drawButton(songs[songKeys[index]].title, 120, 300 + index * 140 - (isSelected ? 15 : 0), isSelected ? 900 : 820, rowHeight, null, function () { selectedSongIndex = rowIndex; });
  }
  for (let index = 0; index < difficultyNames.length; index++) {
    const difficultyIndex = index;
    const isSelected = index === selectedDifficultyIndex;
    drawButton((isSelected ? "▶ " : "") + difficultyNames[index], 1180, 300 + index * 110, 460, 90, null, function () { selectedDifficultyIndex = difficultyIndex; });
  }
  const songKey = songKeys[selectedSongIndex];
  const difficultyName = difficultyNames[selectedDifficultyIndex];
  const difficultyValue = songs[songKey][difficultyName].difficulty;
  const entry = getHighScoreEntry(songKey, difficultyName);
  drawText("Lv." + Math.floor(difficultyValue), 1180, 700, 54, "left");
  drawText(entry ? "HIGH SCORE " + entry.score + "  " + entry.rank + (entry.allPerfect ? "  AP" : entry.fullCombo ? "  FC" : "") : "HIGH SCORE ---", 1180, 790, 44, "left");
  drawButton("ゲームスタート", 1180, 880, 460, 110, "playbutton", function () { startPlay(songKey, difficultyName); });
  drawButton("戻る", 60, 60, 160, 90, "returnbutton", function () { currentScene = "title"; });
  drawButton("設定", 260, 60, 200, 90, "settingbutton", function () { openSettings("songSelect"); });
}

/* ===== 譜面の時間変換 =====
   区間（開始小節・開始時刻・bpm・拍子）を持ち、ノーツの時刻[ms] = 区間開始時刻 + ((小節差) + (拍-1)/拍子の分子) × 1小節の長さ。
   type 0 が来たら、その位置から新しい区間を始める */
function createTimedNotes(song, difficultyName) {
  const chart = song[difficultyName].chart;
  const chartKeys = Object.keys(chart);
  let bpm = song.bpm;
  let meterParts = song.meter.split("/");
  let numerator = Number(meterParts[0]);
  let denominator = Number(meterParts[1]);
  let segmentBar = 1;
  let segmentTime = 0;
  const notes = [];
  const calculateTime = function (bar, beat) {
    const barLength = 240 / bpm * numerator / denominator * 1000;
    return segmentTime + ((bar - segmentBar) + (beat - 1) / numerator) * barLength;
  };
  for (let index = 0; index < chartKeys.length; index++) {
    const source = chart[chartKeys[index]];
    const time = calculateTime(source.bar, source.beat);
    if (source.type === noteTypes.meterChange) {
      segmentBar = source.bar + (source.beat - 1) / numerator;
      segmentTime = time;
      if (source.bpm) bpm = source.bpm;
      if (source.meter) {
        meterParts = source.meter.split("/");
        numerator = Number(meterParts[0]);
        denominator = Number(meterParts[1]);
      }
      continue;
    }
    const note = { type: source.type, lane: source.lane, timeMilliseconds: time + song.offsetMilliseconds, isResolved: false };
    if (source.type === noteTypes.guide) {
      note.endTimeMilliseconds = calculateTime(source.bar2, source.beat2) + song.offsetMilliseconds;
      note.endLane = source.lane2;
      note.color = source.color || "#0000ff";
    }
    notes.push(note);
  }
  return notes;
}

/* ===== プレイ: 開始・状態 =====
   状態 mode: running（進行）/ paused（一時停止）/ countdown（再開前の3,2,1）/ ending（終了演出）。
   時計 playTimeMilliseconds は mode が running の間だけフレーム間隔ぶん進める。
   開始時は -(先読み時間 + Ready + Go) から始め、最初の1秒はReady...とGo!を出す */
let play = null;
function getLookAheadMilliseconds() { return lookAheadBaseMilliseconds / settings.noteFallSpeed; }
function startPlay(songKey, difficultyName) {
  const song = songs[songKey];
  const notes = createTimedNotes(song, difficultyName);
  let lastTime = 0;
  let totalTapCount = 0;
  let totalSoundShardCount = 0;
  for (let index = 0; index < notes.length; index++) {
    lastTime = Math.max(lastTime, notes[index].endTimeMilliseconds || notes[index].timeMilliseconds);
    if (notes[index].type === noteTypes.tap) totalTapCount++;
    if (notes[index].type === noteTypes.soundShard) totalSoundShardCount++;
  }
  play = {
    songKey: songKey, difficultyName: difficultyName, song: song, notes: notes, lastTime: lastTime,
    startTime: -(getLookAheadMilliseconds() + readyDisplayMilliseconds + goDisplayMilliseconds),
    mode: "running", playTimeMilliseconds: 0, countdownRemaining: 0, endTimer: 0,
    currentLaneIndex: 0, visualLanePosition: 0, laneActiveUntil: {},
    score: 0, combo: 0, maxCombo: 0, hitPoints: maximumHitPoints, comboBreakCount: 0,
    judgeCounts: { PERFECT: 0, GOOD: 0, MISS: 0 }, lastJudge: null, lastJudgeTime: 0,
    totalTapCount: totalTapCount, totalSoundShardCount: totalSoundShardCount, collectedSoundShardCount: 0,
  };
  play.playTimeMilliseconds = play.startTime;
  stopBackgroundMusic();
  stopSongAudio();
  currentScene = "play";
}

/* ===== プレイ: 判定 =====
   打鍵: 「判定できるレーン」にある未判定タップのうち時間差が最小のものを対象にする。
   判定できるレーン = laneActiveUntil[レーン] が現在時刻以上（今いるレーンは毎フレーム 現在時刻+judgeWidth[2] で更新するので、移動直後も少しの間は前のレーンが有効）。
   差が judgeWidth[0] 以内で PERFECT、[1] 以内で GOOD。見逃しは [1] を過ぎたら MISS */
function getJudgeTime() { return play.playTimeMilliseconds + settings.judgeOffsetMilliseconds; }
function updateComboBreak() { play.combo = 0; play.comboBreakCount++; }
function updateHitPoints(amount) { play.hitPoints = Math.max(0, Math.min(maximumHitPoints, play.hitPoints + amount)); }
function updateJudgeResult(judgeName) {
  play.judgeCounts[judgeName]++;
  play.lastJudge = judgeName;
  play.lastJudgeTime = play.playTimeMilliseconds;
  play.score += fullScore / play.totalTapCount * judgeScoreRatios[judgeName];
  if (judgeName === "MISS") {
    updateComboBreak();
    updateHitPoints(-hitPointsLostOnMiss);
    return;
  }
  play.combo++;
  play.maxCombo = Math.max(play.maxCombo, play.combo);
  updateHitPoints(play.combo * hitPointsRecoveryPerCombo);
}
function isLaneActive(lane) {
  const activeUntil = play.laneActiveUntil[lane];
  return activeUntil !== undefined && activeUntil >= getJudgeTime();
}
function handleHitKey() {
  const judgeTime = getJudgeTime();
  let target = null;
  let smallestDifference = Infinity;
  for (let index = 0; index < play.notes.length; index++) {
    const note = play.notes[index];
    if (note.type !== noteTypes.tap || note.isResolved || !isLaneActive(note.lane)) continue;
    const difference = Math.abs(note.timeMilliseconds - judgeTime);
    if (difference <= judgeWidthMilliseconds[1] && difference < smallestDifference) { target = note; smallestDifference = difference; }
  }
  if (!target) return;
  target.isResolved = true;
  const judgeName = smallestDifference <= judgeWidthMilliseconds[0] ? "PERFECT" : "GOOD";
  updateJudgeResult(judgeName);
  playSoundEffect(judgeName === "PERFECT" ? "hitperfect" : "hitgood", settings.playSeVolume * (judgeName === "PERFECT" ? settings.hitPerfectVolume : settings.hitGoodVolume) / 100);
}
function updateJudgement() {
  const judgeTime = getJudgeTime();
  play.laneActiveUntil[play.currentLaneIndex] = judgeTime + judgeWidthMilliseconds[2];
  for (let index = 0; index < play.notes.length; index++) {
    const note = play.notes[index];
    if (note.isResolved) continue;
    if (note.type === noteTypes.tap && judgeTime > note.timeMilliseconds + judgeWidthMilliseconds[1]) {
      note.isResolved = true;
      updateJudgeResult("MISS");
      playSoundEffect("hitmiss", settings.playSeVolume * settings.hitMissVolume / 100);
    } else if (note.type === noteTypes.soundShard || note.type === noteTypes.damage) {
      const windowMilliseconds = note.type === noteTypes.soundShard ? soundShardCollectWindowMilliseconds : damageTouchWindowMilliseconds;
      if (Math.abs(note.timeMilliseconds - judgeTime) <= windowMilliseconds && isLaneActive(note.lane)) {
        note.isResolved = true;
        if (note.type === noteTypes.soundShard) { play.collectedSoundShardCount++; } else { updateComboBreak(); updateHitPoints(-hitPointsLostOnDamage); }
      } else if (judgeTime > note.timeMilliseconds + windowMilliseconds) {
        note.isResolved = true;
      }
    }
  }
}

/* ===== プレイ: レーン移動と進行 =====
   論理上の位置 currentLaneIndex は即座に動かし、見た目の visualLanePosition だけを一定速度で追従させる。
   端のレーン（±(laneCount-1)/2）より先には動かない */
function handleLaneMove(direction) {
  const edge = (play.song.laneCount - 1) / 2;
  play.currentLaneIndex = Math.max(-edge, Math.min(edge, play.currentLaneIndex + direction));
}
function updateVisualLane(deltaMilliseconds) {
  const difference = play.currentLaneIndex - play.visualLanePosition;
  const step = deltaMilliseconds / laneMoveDurationMilliseconds;
  play.visualLanePosition += Math.sign(difference) * Math.min(Math.abs(difference), step);
}
function updatePlay(deltaMilliseconds) {
  if (play.mode === "countdown") {
    play.countdownRemaining -= deltaMilliseconds;
    if (play.countdownRemaining <= 0) { play.mode = "running"; resumeSongAudio(); }
    return;
  }
  if (play.mode === "running") {
    play.playTimeMilliseconds += deltaMilliseconds;
    updateSongAudioSync();
    updateVisualLane(deltaMilliseconds);
    updateJudgement();
    if (play.playTimeMilliseconds > play.lastTime) { play.mode = "ending"; play.endTimer = 0; }
    return;
  }
  if (play.mode === "ending") {
    play.endTimer += deltaMilliseconds;
    updateVisualLane(deltaMilliseconds);
    if (play.endTimer >= resultEffectDelayMilliseconds + resultEffectDisplayMilliseconds + resultFadeOutMilliseconds) startResult();
  }
}
function updatePause() { if (play.mode === "running") { play.mode = "paused"; pauseSongAudio(); } }
function startResume() { play.mode = "countdown"; play.countdownRemaining = countdownStepMilliseconds * countdownStepCount; }

/* ===== プレイ: 描画 =====
   t = (ノーツ時刻 - 現在時刻) / 先読み時間（1=奥、0=判定ライン）、s = t の加速指数乗（過ぎたあとは線形）。
   y = 判定ラインy - s×(判定ラインy - 奥端y)、奥行き倍率 = 1 - (1-奥のレーン幅の割合)×s、
   x = 中央 + (ノーツのレーン - 見た目のレーン位置) × レーン幅 × 奥行き倍率 */
function getDepthScale(time) {
  const t = (time - getJudgeTime()) / getLookAheadMilliseconds();
  return t < 0 ? t : Math.pow(t, settings.accelerationExponent);
}
function projectPoint(lane, s) {
  const judgeY = canvasLogicalHeight * judgeLineYPercent / 100;
  const farY = canvasLogicalHeight * laneFarEndYPercent / 100;
  const depth = 1 - (1 - settings.farLaneWidthRatio) * s;
  return { x: canvasLogicalWidth / 2 + (lane - play.visualLanePosition) * settings.laneWidthAtJudgeLine * depth, y: judgeY - s * (judgeY - farY), depth: depth };
}
function drawLanes() {
  const edge = (play.song.laneCount - 1) / 2;
  for (let lane = -edge; lane <= edge; lane++) {
    const farLeft = projectPoint(lane - 0.5, 1);
    const farRight = projectPoint(lane + 0.5, 1);
    const nearLeft = projectPoint(lane - 0.5, 0);
    const nearRight = projectPoint(lane + 0.5, 0);
    context.fillStyle = lane % 2 === 0 ? "rgba(80, 140, 255, 0.14)" : "rgba(80, 140, 255, 0.08)";
    context.beginPath();
    context.moveTo(farLeft.x, farLeft.y); context.lineTo(farRight.x, farRight.y);
    context.lineTo(nearRight.x, nearRight.y); context.lineTo(nearLeft.x, nearLeft.y);
    context.closePath(); context.fill();
    context.strokeStyle = "rgba(160, 200, 255, 0.5)"; context.lineWidth = 2; context.stroke();
  }
  const lineLeft = projectPoint(-edge - 0.5, 0);
  const lineRight = projectPoint(edge + 0.5, 0);
  context.strokeStyle = "#ffffff"; context.lineWidth = 6;
  context.beginPath(); context.moveTo(lineLeft.x, lineLeft.y); context.lineTo(lineRight.x, lineRight.y); context.stroke();
}
function drawGuide(note) {
  const start = Math.max(getDepthScale(note.timeMilliseconds), -0.1);
  const end = Math.min(getDepthScale(note.endTimeMilliseconds), 1);
  if (end < -0.1 || start > 1 || end <= start) return;
  const startRatio = (start - getDepthScale(note.timeMilliseconds)) / (getDepthScale(note.endTimeMilliseconds) - getDepthScale(note.timeMilliseconds));
  const lane = function (ratio) { return note.lane + (note.endLane - note.lane) * ratio; };
  const endRatio = (end - getDepthScale(note.timeMilliseconds)) / (getDepthScale(note.endTimeMilliseconds) - getDepthScale(note.timeMilliseconds));
  const startPoint = projectPoint(lane(startRatio), start);
  const endPoint = projectPoint(lane(endRatio), end);
  const startHalf = settings.laneWidthAtJudgeLine * guideBandWidthRatio * startPoint.depth / 2;
  const endHalf = settings.laneWidthAtJudgeLine * guideBandWidthRatio * endPoint.depth / 2;
  context.globalAlpha = settings.guideOpacityPercent / 100;
  context.fillStyle = note.color;
  context.beginPath();
  context.moveTo(startPoint.x - startHalf, startPoint.y); context.lineTo(startPoint.x + startHalf, startPoint.y);
  context.lineTo(endPoint.x + endHalf, endPoint.y); context.lineTo(endPoint.x - endHalf, endPoint.y);
  context.closePath(); context.fill();
  context.globalAlpha = 1;
}
function drawNote(note) {
  const s = getDepthScale(note.timeMilliseconds);
  if (s > 1 || s < -0.15) return;
  const point = projectPoint(note.lane, s);
  const width = settings.laneWidthAtJudgeLine * 0.85 * point.depth;
  const height = 36 * point.depth;
  if (note.type === noteTypes.tap) { context.fillStyle = "#ffe066"; context.fillRect(point.x - width / 2, point.y - height / 2, width, height); }
  if (note.type === noteTypes.soundShard) { context.fillStyle = "#7dffcf"; context.beginPath(); context.arc(point.x, point.y, 26 * point.depth, 0, Math.PI * 2); context.fill(); }
  if (note.type === noteTypes.damage) { context.fillStyle = "#ff4d6d"; context.fillRect(point.x - width / 3, point.y - height / 2, width * 2 / 3, height); }
}
function drawHitPointBar() {
  const ratio = play.hitPoints / maximumHitPoints;
  context.fillStyle = "rgba(255,255,255,0.15)"; context.fillRect(1380, 40, 480, 34);
  context.fillStyle = ratio > 0.5 ? "#5be37d" : ratio > 0.25 ? "#ffd84d" : "#ff4d4d";
  context.fillRect(1380, 40, 480 * ratio, 34);
  drawText(String(Math.ceil(play.hitPoints)), 1350, 57, 40, "right");
}
function getEndEffectLabel() {
  if (play.comboBreakCount === 0 && play.judgeCounts.GOOD === 0) return "ALL PERFECT";
  if (play.comboBreakCount === 0) return "FULL COMBO";
  return play.hitPoints > 0 ? "CLEAR" : "";
}
function drawPlayScene() {
  context.fillStyle = "#0b1020"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  drawLanes();
  for (let index = 0; index < play.notes.length; index++) { if (play.notes[index].type === noteTypes.guide) drawGuide(play.notes[index]); }
  for (let index = 0; index < play.notes.length; index++) { if (!play.notes[index].isResolved && play.notes[index].type !== noteTypes.guide) drawNote(play.notes[index]); }
  drawImageOrFrame("maincharacter_back", canvasLogicalWidth / 2 - 70, canvasLogicalHeight * judgeLineYPercent / 100 + 10, 140, 180);
  drawText(String(Math.round(play.score)).padStart(7, "0"), 60, 70, 64, "left");
  drawHitPointBar();
  if (play.combo > 0) {
    const comboX = canvasLogicalWidth * settings.comboPositionXPercent / 100;
    const comboY = canvasLogicalHeight * settings.comboPositionYPercent / 100;
    drawText(String(play.combo), comboX, comboY, 120, "center");
    drawText("COMBO", comboX, comboY + 80, 40, "center");
  }
  if (play.lastJudge && settings["is" + play.lastJudge.charAt(0) + play.lastJudge.slice(1).toLowerCase() + "Displayed"] && play.playTimeMilliseconds - play.lastJudgeTime < 300) drawText(play.lastJudge, canvasLogicalWidth / 2, canvasLogicalHeight * 0.62, 64, "center", play.lastJudge === "MISS" ? "#ff8899" : "#ffffff");
  const elapsed = play.playTimeMilliseconds - play.startTime;
  if (elapsed < readyDisplayMilliseconds) drawText("Ready...", 960, 400, 110, "center");
  else if (elapsed < readyDisplayMilliseconds + goDisplayMilliseconds) drawText("Go!", 960, 400, 130, "center");
  if (play.mode === "ending") {
    const effectEnd = resultEffectDelayMilliseconds + resultEffectDisplayMilliseconds;
    if (play.endTimer >= resultEffectDelayMilliseconds && play.endTimer < effectEnd) drawText(getEndEffectLabel(), 960, 480, 150, "center", "#ffe066");
    if (play.endTimer >= effectEnd) { context.fillStyle = "rgba(0,0,0," + Math.min(1, (play.endTimer - effectEnd) / resultFadeOutMilliseconds) + ")"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight); }
  }
  if (play.mode === "paused" || play.mode === "countdown") {
    context.fillStyle = "rgba(0,0,0,0.6)"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  }
  if (play.mode === "paused") {
    drawText("一時停止", 960, 260, 80, "center");
    drawButton("再開", 710, 360, 500, 100, null, startResume);
    drawButton("やり直し", 710, 490, 500, 100, null, function () { startPlay(play.songKey, play.difficultyName); });
    drawButton("設定", 710, 620, 500, 100, "settingbutton", function () { openSettings("play"); });
    drawButton("曲選択へ", 710, 750, 500, 100, "returnbutton", function () { stopSongAudio(); currentScene = "songSelect"; });
  }
  if (play.mode === "countdown") drawText(String(Math.ceil(play.countdownRemaining / countdownStepMilliseconds)), 960, 540, 220, "center");
  if (play.mode === "running" || play.mode === "ending") drawButton("Ⅱ", 1780, 100, 90, 90, "pausebutton", updatePause);
}

/* ===== リザルト =====
   画面に入る時に1回だけ、ランク・NEW RECORD・音のかけらの獲得量を計算して保存する。
   獲得量 = floor((取った数 / 譜面の総数 × 難易度 × multiple) ^ exponent)。総数が0なら0 */
let result = null;
function calculateRankName(score) {
  const rankNames = Object.keys(rankBorders);
  for (let index = 0; index < rankNames.length; index++) { if (score >= rankBorders[rankNames[index]]) return rankNames[index]; }
  return "D";
}
function startResult() {
  const score = play.judgeCounts.GOOD === 0 && play.judgeCounts.MISS === 0 ? fullScore : Math.round(play.score);
  const difficultyValue = play.song[play.difficultyName].difficulty;
  const reward = play.totalSoundShardCount === 0 ? 0 : Math.floor(Math.pow(play.collectedSoundShardCount / play.totalSoundShardCount * difficultyValue * soundShardRewardMultiple, soundShardRewardExponent));
  const isFullCombo = play.comboBreakCount === 0;
  const isAllPerfect = isFullCombo && play.judgeCounts.GOOD === 0;
  const highScores = loadStoredValue("highScores", {});
  const entryKey = play.songKey + "_" + play.difficultyName;
  const previous = highScores[entryKey];
  const isNewRecord = !previous || score > previous.score;
  highScores[entryKey] = {
    score: isNewRecord ? score : previous.score, rank: isNewRecord ? calculateRankName(score) : previous.rank,
    maxCombo: isNewRecord ? play.maxCombo : previous.maxCombo, fullCombo: isNewRecord ? isFullCombo : previous.fullCombo,
    allPerfect: isNewRecord ? isAllPerfect : previous.allPerfect, playCount: (previous ? previous.playCount : 0) + 1,
  };
  saveStoredValue("highScores", highScores);
  saveStoredValue("soundShards", loadStoredValue("soundShards", 0) + reward);
  result = { score: score, rank: calculateRankName(score), isNewRecord: isNewRecord, isFullCombo: isFullCombo, isAllPerfect: isAllPerfect, counts: Object.assign({}, play.judgeCounts), maxCombo: play.maxCombo, songKey: play.songKey, difficultyName: play.difficultyName };
  stopSongAudio();
  saveCloudAll();
  startBackgroundMusic("resultbgm");
  currentScene = "result";
}
function drawResultScene() {
  context.fillStyle = "#0b1020"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  drawText(songs[result.songKey].title + "  [" + result.difficultyName + " Lv." + Math.floor(songs[result.songKey][result.difficultyName].difficulty) + "]", 960, 70, 56, "center");
  drawImageOrFrame("maincharacter_front", 120, 160, 780, 820);
  drawImageOrFrame("rank" + result.rank, 1000, 150, 220, 220);
  drawText(result.rank + "  " + String(result.score).padStart(7, "0"), 1260, 250, 80, "left");
  if (result.isNewRecord) drawText("NEW RECORD", 1260, 330, 36, "left", "#ffe066");
  for (let index = 0; index < judgeNames.length; index++) {
    drawText(judgeNames[index], 1060, 450 + index * 70, 48, "left");
    drawText(String(result.counts[judgeNames[index]]), 1700, 450 + index * 70, 48, "right");
  }
  drawText(result.isAllPerfect ? "ALL PERFECT" : result.isFullCombo ? "FULL COMBO" : "", 1380, 720, 60, "center", "#ffe066");
  drawText("MAX COMBO  " + result.maxCombo, 1060, 820, 52, "left");
  drawButton("リトライ", 1000, 910, 380, 100, "retrybutton", function () { startPlay(result.songKey, result.difficultyName); });
  drawButton("曲選択へ", 1440, 910, 380, 100, "returnbutton", function () { currentScene = "songSelect"; });
}

/* ===== キー入力 =====
   keydown の瞬間だけ反応し、長押し（event.repeat）は無視する。キーは小文字にそろえて割り当て表と照合する */
function hasKey(bindingName, key) { return keyBindings[bindingName].indexOf(key) >= 0; }
document.addEventListener("keydown", function (event) {
  if (event.repeat || (event.target && event.target.tagName === "INPUT")) return;
  const key = event.key.toLowerCase();
  if (handleSettingsKey(key)) return;
  if (currentScene === "story") { if (key === "enter") advanceStory(); return; }
  if (currentScene === "title" && key === "enter") startFromTitle();
  else if (currentScene === "songSelect") {
    if (key === "arrowup") selectedSongIndex = (selectedSongIndex + songKeys.length - 1) % songKeys.length;
    if (key === "arrowdown") selectedSongIndex = (selectedSongIndex + 1) % songKeys.length;
    if (key === "arrowleft") selectedDifficultyIndex = (selectedDifficultyIndex + difficultyNames.length - 1) % difficultyNames.length;
    if (key === "arrowright") selectedDifficultyIndex = (selectedDifficultyIndex + 1) % difficultyNames.length;
    if (key === "enter") startPlay(songKeys[selectedSongIndex], difficultyNames[selectedDifficultyIndex]);
  } else if (currentScene === "play") {
    if (key === "escape") { if (play.mode === "running") updatePause(); else if (play.mode === "paused") startResume(); return; }
    if (play.mode !== "running") return;
    if (hasKey("moveLeft", key)) handleLaneMove(-1);
    if (hasKey("moveRight", key)) handleLaneMove(1);
    if (hasKey("hit", key)) handleHitKey();
  } else if (currentScene === "result") {
    if (key === "enter") startPlay(result.songKey, result.difficultyName);
    if (key === "escape") currentScene = "songSelect";
  }
  if (key.indexOf("arrow") === 0) event.preventDefault();
});
window.addEventListener("blur", function () { if (currentScene === "play" && play.mode === "running") updatePause(); });

/* ===== 追加の設定値と保存 =====
   設定は settings（数値）と keyBindings（キー割り当て）に持ち、設定画面を閉じる時に localStorage とクラウドへ保存する */
Object.assign(settings, {
  systemBgmVolume: 100, playBgmVolume: 100, systemSeVolume: 100, playSeVolume: 100,
  hitPerfectVolume: 100, hitGoodVolume: 100, hitMissVolume: 0, isPerfectDisplayed: 1, isGoodDisplayed: 1, isMissDisplayed: 1,
});
const keyBindings = JSON.parse(JSON.stringify(defaultKeyBindings));
function loadSettings() {
  const stored = loadStoredValue("settings", {});
  Object.assign(settings, stored.values || {});
  Object.assign(keyBindings, stored.keys || {});
}
function saveSettings() {
  saveStoredValue("settings", { values: settings, keys: keyBindings });
  saveCloudAll();
}

/* ===== 音量と曲の同期 =====
   音量は GainNode で掛けるので 100% を超えても鳴らせる（0〜200%）。
   曲は再生開始後、audio.currentTime をプレイ時計に採用する（音声がなければ従来どおりフレーム間隔で進める） */
let audioContext = null;
const gainNodes = new WeakMap();
function applyAudioVolume(audio, percent) {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (!gainNodes.has(audio)) {
      const gain = audioContext.createGain();
      audioContext.createMediaElementSource(audio).connect(gain);
      gain.connect(audioContext.destination);
      gainNodes.set(audio, gain);
    }
    gainNodes.get(audio).gain.value = percent / 100;
    if (audioContext.state === "suspended") audioContext.resume();
  } catch (error) { audio.volume = Math.min(1, percent / 100); }
}
function updateSongAudioSync() {
  const audio = loadedAudio[play.songKey];
  if (!audio) return;
  if (!play.isSongStarted && play.playTimeMilliseconds >= 0) {
    play.isSongStarted = true;
    applyAudioVolume(audio, settings.playBgmVolume);
    audio.loop = false; audio.currentTime = 0; audio.play().catch(function () {});
  } else if (play.isSongStarted && !audio.paused) {
    play.playTimeMilliseconds = audio.currentTime * 1000;
  }
}
function pauseSongAudio() { const audio = loadedAudio[play.songKey]; if (audio) audio.pause(); }
function resumeSongAudio() { const audio = loadedAudio[play.songKey]; if (audio && play.isSongStarted) audio.play().catch(function () {}); }
function stopSongAudio() {
  for (let index = 0; index < songKeys.length; index++) {
    const audio = loadedAudio[songKeys[index]];
    if (audio) { audio.pause(); audio.currentTime = 0; }
  }
}

/* ===== ストーリー =====
   1行ずつ表示し、クリック・Enterで進む。表示した行数を端末に保存し、途中でやめたら次回はその行から。
   最後まで読むかスキップしたら「読了」として次回以降は飛ばし、クラウドへ保存する */
const storyLines = Object.freeze([
  "この世界は、音であふれていた。", "風が木々を揺らす音。川が流れる音。市場に響く人々の声。",
  "そして、どこからともなく聞こえてくる、やさしいメロディ。", "ある日、", "空に大きな裂け目が開いた。",
  "世界中の音が、渦を巻いてその中へ吸い込まれていく。", "気づくと、世界は静まり返っていた。",
  "風は吹いているのに、音がしない。", "人々は口を動かしているのに、声が届かない。", "足音すら、聞こえなくなっていた。",
  "そのとき、空の裂け目から光るものが降ってきた。", "吸い込まれた音が、砕けてかけらになったものだ。",
  "ひとつ拾うと、小さなメロディが響いた。", "「かけらを全部集めれば、世界に音が戻る」", "旅人は走り出した。",
  "音のかけらが降り注ぐ、その場所へ。",
]);
let storyIndex = 0;
function startFromTitle() {
  if (loadStoredValue("storyProgress", 0) >= storyLines.length) { currentScene = "songSelect"; return; }
  storyIndex = loadStoredValue("storyProgress", 0);
  currentScene = "story";
}
function finishStory() {
  saveStoredValue("storyProgress", storyLines.length);
  saveCloudAll();
  currentScene = "songSelect";
}
function advanceStory() {
  storyIndex++;
  if (storyIndex >= storyLines.length) { finishStory(); return; }
  saveStoredValue("storyProgress", storyIndex);
}
function drawStoryScene() {
  const image = getImage("storyimg" + String(storyIndex + 1).padStart(2, "0"));
  context.fillStyle = "#0b1020"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  if (image) context.drawImage(image, 0, 0, canvasLogicalWidth, canvasLogicalHeight);
  nextButtonList.push({ x: 0, y: 0, width: canvasLogicalWidth, height: canvasLogicalHeight, onClick: advanceStory });
  drawText(storyLines[storyIndex], 960, 540, 56, "center");
  drawButton("スキップ", 1660, 40, 220, 80, "skipbutton", finishStory);
}

/* ===== 設定画面 =====
   タブ（プレイ/画面/音/キー/アカウント）ごとに、settingTabs の行を並べて描く。
   数値の行は、刻みの配列 steps から「-大…-小 +小…+大」のボタンを作る（Canvasには入力欄がないため）。
   キーの行は「追加」を押した次のキー入力を割り当てる。競合は拒否し、1動作4キーまで */
const settingTabs = Object.freeze({
  play: { label: "プレイ", rows: [
    { key: "noteFallSpeed", label: "落下速度", min: 1, max: 20, steps: [1, 0.1, 0.01] },
    { key: "accelerationExponent", label: "加速(小さいほど手前で加速)", min: 0.1, max: 1.5, steps: [0.1, 0.01] },
    { key: "judgeOffsetMilliseconds", label: "判定ズレ(ms)", min: -9999, max: 9999, steps: [100, 10, 1] }] },
  screen: { label: "画面", rows: [
    { key: "farLaneWidthRatio", label: "奥のレーン幅", min: 0.01, max: 1, steps: [0.1, 0.01] },
    { key: "laneWidthAtJudgeLine", label: "判定ライン上のレーン幅", min: 100, max: 600, steps: [50, 10] },
    { key: "guideOpacityPercent", label: "ガイドの濃さ(%)", min: 10, max: 100, steps: [10, 1] },
    { key: "comboPositionXPercent", label: "コンボ位置 x(%)", min: 0, max: 100, steps: [10, 1] },
    { key: "comboPositionYPercent", label: "コンボ位置 y(%)", min: 0, max: 100, steps: [10, 1] },
    { key: "isPerfectDisplayed", label: "PERFECT表示", min: 0, max: 1, steps: [1] },
    { key: "isGoodDisplayed", label: "GOOD表示", min: 0, max: 1, steps: [1] },
    { key: "isMissDisplayed", label: "MISS表示", min: 0, max: 1, steps: [1] }] },
  sound: { label: "音", rows: [
    { key: "systemBgmVolume", label: "システムBGM", min: 0, max: 200, steps: [10, 1] },
    { key: "playBgmVolume", label: "プレイBGM", min: 0, max: 200, steps: [10, 1] },
    { key: "systemSeVolume", label: "システムSE", min: 0, max: 200, steps: [10, 1] },
    { key: "playSeVolume", label: "プレイSE", min: 0, max: 200, steps: [10, 1] },
    { key: "hitPerfectVolume", label: "打鍵音 PERFECT", min: 0, max: 200, steps: [10, 1] },
    { key: "hitGoodVolume", label: "打鍵音 GOOD", min: 0, max: 200, steps: [10, 1] },
    { key: "hitMissVolume", label: "打鍵音 MISS", min: 0, max: 200, steps: [10, 1] }] },
  keys: { label: "キー", rows: [] },
  account: { label: "アカウント", rows: [] },
});
const keyActionLabels = Object.freeze({ moveLeft: "左へ移動", moveRight: "右へ移動", hit: "ノーツを叩く" });
let selectedSettingTab = "play";
let settingsReturnScene = "songSelect";
let waitingKeyAction = null;
let settingsMessage = "";
function openSettings(returnScene) { settingsReturnScene = returnScene; currentScene = "settings"; }
function closeSettings() { waitingKeyAction = null; settingsMessage = ""; saveSettings(); currentScene = settingsReturnScene; }
function updateSettingValue(row, delta) {
  settings[row.key] = Math.max(row.min, Math.min(row.max, Math.round((settings[row.key] + delta) * 100) / 100));
}
function handleSettingsKey(key) {
  if (currentScene !== "settings" || !waitingKeyAction) return false;
  const actionNames = Object.keys(keyBindings);
  let isUsed = false;
  for (let index = 0; index < actionNames.length; index++) { if (keyBindings[actionNames[index]].indexOf(key) >= 0) isUsed = true; }
  if (key === "escape") settingsMessage = "";
  else if (isUsed) settingsMessage = "そのキーはすでに使われています";
  else if (keyBindings[waitingKeyAction].length >= 4) settingsMessage = "1つの動作に割り当てられるキーは4つまでです";
  else { keyBindings[waitingKeyAction].push(key); settingsMessage = ""; }
  waitingKeyAction = null;
  return true;
}
function drawSettingRows(rows) {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const y = 270 + index * 78;
    const isToggle = row.max === 1 && row.min === 0;
    drawText(row.label, 120, y + 30, 36, "left");
    drawText(isToggle ? (settings[row.key] ? "ON" : "OFF") : String(settings[row.key]), 800, y + 30, 36, "right");
    const deltas = [];
    for (let stepIndex = 0; stepIndex < row.steps.length; stepIndex++) deltas.push(-row.steps[stepIndex]);
    for (let stepIndex = row.steps.length - 1; stepIndex >= 0; stepIndex--) deltas.push(row.steps[stepIndex]);
    for (let buttonIndex = 0; buttonIndex < deltas.length; buttonIndex++) {
      const delta = deltas[buttonIndex];
      const label = isToggle ? "切替" : (delta > 0 ? "+" : "") + delta;
      drawButton(label, 880 + buttonIndex * 130, y, 120, 64, null, function () { updateSettingValue(row, isToggle ? (settings[row.key] ? -1 : 1) : delta); });
    }
  }
}
function drawSettingsScene() {
  context.fillStyle = "#0b1020"; context.fillRect(0, 0, canvasLogicalWidth, canvasLogicalHeight);
  const tabNames = Object.keys(settingTabs);
  for (let index = 0; index < tabNames.length; index++) {
    const tabName = tabNames[index];
    drawButton((tabName === selectedSettingTab ? "▶ " : "") + settingTabs[tabName].label, 60 + index * 360, 60, 340, 90, null, function () { selectedSettingTab = tabName; waitingKeyAction = null; });
  }
  if (selectedSettingTab === "keys") {
    const actionNames = Object.keys(keyBindings);
    for (let index = 0; index < actionNames.length; index++) {
      const actionName = actionNames[index];
      const y = 270 + index * 110;
      drawText(keyActionLabels[actionName], 120, y + 30, 40, "left");
      drawText(keyBindings[actionName].join(" , ").toUpperCase(), 520, y + 30, 36, "left");
      drawButton(waitingKeyAction === actionName ? "キーを押す..." : "追加", 1300, y, 240, 70, null, function () { waitingKeyAction = actionName; });
      drawButton("初期化", 1560, y, 240, 70, null, function () { keyBindings[actionName] = defaultKeyBindings[actionName].slice(); });
    }
    drawText("Escは一時停止専用です", 120, 700, 32, "left");
  } else if (selectedSettingTab === "account") {
    drawText(account.user ? "状態: ログイン中 (" + account.displayName + ")" : "状態: ゲスト", 120, 300, 44, "left");
    if (!supabaseClient) drawText("サーバー設定がまだ入っていません（supabaseUrl と supabaseAnonKey）", 120, 380, 32, "left", "#ffb3c0");
    if (!account.user) {
      drawButton("ログイン", 120, 450, 420, 100, "loginbutton", function () { openAccountModal("login"); });
      drawButton("新規登録", 580, 450, 420, 100, "registerbutton", function () { openAccountModal("register"); });
    } else {
      drawButton("ログアウト", 120, 450, 420, 100, "logoutbutton", startLogout);
    }
    drawButton("データを削除", 120, 600, 420, 100, "deletedatabutton", startDeleteData);
  } else {
    drawSettingRows(settingTabs[selectedSettingTab].rows);
  }
  drawText(settingsMessage, 120, 900, 34, "left", "#ffb3c0");
  drawButton("戻る", 60, 960, 200, 90, "returnbutton", closeSettings);
}

/* ===== アカウント（Supabase）=====
   ID は疑似メールに変換してメール+パスワード方式で登録する。入力欄だけは HTMLのモーダルを重ねる（Canvasに入力欄がないため）。
   ログイン中は localStorage のキー接頭辞を account 用に切り替え、ログアウトで消す。
   ログイン時: クラウドを取得 → ゲストのデータと合わせる（スコアは高い方、回数は多い方、音のかけらは足して、ゲスト側は0に戻す）→ 保存。
   保存に失敗しても止めず、次の保存でまとめて再送する */
const supabaseUrl = "";
const supabaseAnonKey = "";
const supabaseClient = (supabaseUrl && window.supabase) ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;
const guestStoragePrefix = "plurythme_guest_";
const accountStoragePrefix = "plurythme_account_";
const accountStoredNames = Object.freeze(["highScores", "soundShards", "settings", "storyProgress"]);
const pseudoEmailDomain = "users.plurythme.example.com";
const userIdPattern = /^[A-Za-z0-9_]{3,16}$/;
const passwordMinimumLength = 8;
const displayNameMaxLength = 15;
const loginFailureLimit = 5;
const loginLockMilliseconds = 600000;
const errorDefinitions = Object.freeze({
  invalidUserId: "IDは半角英数字と_で3〜16文字にしてください", shortPassword: "パスワードは8文字以上です",
  mismatch: "パスワードが一致しません", invalidName: "表示名は1〜15文字にしてください", duplicate: "このIDは使われています",
  wrongLogin: "IDまたはパスワードが違います", network: "つながりませんでした。あとでもう一度お試しください",
  locked: "ログインに続けて失敗したため、しばらく使えません",
});
const account = { user: null, displayName: "" };
let syncFailedUntil = 0;
let accountModalMode = "login";
const accountModal = document.createElement("div");
accountModal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);align-items:center;justify-content:center;z-index:10;font-family:sans-serif";
accountModal.innerHTML = '<form id="accountForm" style="background:#14213d;color:#fff;padding:24px;border-radius:12px;width:min(92vw,380px);display:flex;flex-direction:column;gap:10px"><h2 id="accountTitle" style="margin:0"></h2><input id="accountUserId" placeholder="ユーザーID" autocomplete="username" maxlength="16"><input id="accountPassword" type="password" placeholder="パスワード（8文字以上）" autocomplete="current-password"><input id="accountPasswordConfirm" type="password" placeholder="パスワード（確認）" autocomplete="new-password"><input id="accountDisplayName" placeholder="表示名（ニックネーム）" maxlength="15"><p id="accountNotice" style="margin:0;font-size:13px"></p><p id="accountError" style="margin:0;color:#ff9aa8;font-size:14px"></p><div style="display:flex;gap:8px"><button type="submit">OK</button><button type="button" id="accountCancel">キャンセル</button></div></form>';
document.body.appendChild(accountModal);
function getAccountElement(id) { return document.getElementById(id); }
function openAccountModal(mode) {
  accountModalMode = mode;
  const titles = { login: "ログイン", register: "新規登録", reset: "新しいパスワードを決める" };
  getAccountElement("accountTitle").textContent = titles[mode];
  getAccountElement("accountUserId").style.display = mode === "reset" ? "none" : "";
  getAccountElement("accountPasswordConfirm").style.display = mode === "login" ? "none" : "";
  getAccountElement("accountDisplayName").style.display = mode === "register" ? "" : "none";
  getAccountElement("accountNotice").textContent = mode === "register" ? "パスワードを忘れると、自分では再設定できません。表示名はニックネームにして、本名や学校名は入れないでください。" : "";
  getAccountElement("accountError").textContent = "";
  getAccountElement("accountPassword").value = "";
  accountModal.style.display = "flex";
}
function setAccountError(text) { getAccountElement("accountError").textContent = text; }
getAccountElement("accountCancel").addEventListener("click", function () { accountModal.style.display = "none"; });
getAccountElement("accountForm").addEventListener("submit", function (event) { event.preventDefault(); submitAccountForm(); });
function isLoginLocked() { return loadStoredValue("loginLockedUntil", 0) > Date.now(); }
function updateLoginFailure() {
  const count = loadStoredValue("loginFailureCount", 0) + 1;
  if (count >= loginFailureLimit) { saveStoredValue("loginLockedUntil", Date.now() + loginLockMilliseconds); saveStoredValue("loginFailureCount", 0); }
  else saveStoredValue("loginFailureCount", count);
}
async function submitAccountForm() {
  const mode = accountModalMode;
  const userId = getAccountElement("accountUserId").value;
  const password = getAccountElement("accountPassword").value;
  const displayName = getAccountElement("accountDisplayName").value.trim();
  if (!supabaseClient) { setAccountError(errorDefinitions.network); return; }
  if (mode !== "reset" && !userIdPattern.test(userId)) { setAccountError(errorDefinitions.invalidUserId); return; }
  if (password.length < passwordMinimumLength) { setAccountError(errorDefinitions.shortPassword); return; }
  if (mode !== "login" && password !== getAccountElement("accountPasswordConfirm").value) { setAccountError(errorDefinitions.mismatch); return; }
  if (mode === "register" && (displayName.length < 1 || displayName.length > displayNameMaxLength)) { setAccountError(errorDefinitions.invalidName); return; }
  if (mode === "login" && isLoginLocked()) { setAccountError(errorDefinitions.locked); return; }
  const email = userId + "@" + pseudoEmailDomain;
  try {
    if (mode === "reset") {
      const updated = await supabaseClient.auth.updateUser({ password: password });
      if (updated.error) throw updated.error;
      await supabaseClient.from("user_progress").upsert({ user_id: account.user.id, must_change_password: false });
    } else if (mode === "register") {
      const created = await supabaseClient.auth.signUp({ email: email, password: password });
      if (created.error) { setAccountError(/registered|already/i.test(created.error.message) ? errorDefinitions.duplicate : errorDefinitions.network); return; }
      if (!created.data.session) { setAccountError(errorDefinitions.network); return; }
      await supabaseClient.from("profiles").insert({ user_id: created.data.user.id, display_name: displayName });
      await startAccountSession(created.data.user);
    } else {
      const signedIn = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (signedIn.error) { updateLoginFailure(); setAccountError(errorDefinitions.wrongLogin); return; }
      await startAccountSession(signedIn.data.user);
    }
    accountModal.style.display = "none";
  } catch (error) { setAccountError(errorDefinitions.network); }
}
async function startAccountSession(user) {
  const guestScores = loadStoredValue("highScores", {});
  const guestShards = loadStoredValue("soundShards", 0);
  const guestStory = loadStoredValue("storyProgress", 0);
  saveStoredValue("soundShards", 0);
  account.user = user;
  storageKeyPrefix = accountStoragePrefix;
  const results = await Promise.all([
    supabaseClient.from("high_scores").select("*"), supabaseClient.from("user_progress").select("*").maybeSingle(),
    supabaseClient.from("user_settings").select("settings").maybeSingle(), supabaseClient.from("profiles").select("display_name").maybeSingle(),
  ]);
  const scores = {};
  const rows = results[0].data || [];
  for (let index = 0; index < rows.length; index++) {
    scores[rows[index].song_key + "_" + rows[index].difficulty] = { score: rows[index].score, rank: rows[index].rank, maxCombo: rows[index].max_combo, playCount: rows[index].play_count, fullCombo: false, allPerfect: false };
  }
  const guestKeys = Object.keys(guestScores);
  for (let index = 0; index < guestKeys.length; index++) {
    const mine = guestScores[guestKeys[index]];
    const theirs = scores[guestKeys[index]];
    scores[guestKeys[index]] = !theirs || mine.score > theirs.score ? Object.assign({}, mine, { playCount: Math.max(mine.playCount, theirs ? theirs.playCount : 0) }) : Object.assign({}, theirs, { playCount: Math.max(mine.playCount, theirs.playCount) });
  }
  const progress = results[1].data || { sound_shards: 0, story_progress: 0 };
  saveStoredValue("highScores", scores);
  saveStoredValue("soundShards", progress.sound_shards + guestShards);
  saveStoredValue("storyProgress", Math.max(progress.story_progress, guestStory));
  if (results[2].data) { saveStoredValue("settings", results[2].data.settings); loadSettings(); }
  account.displayName = results[3].data ? results[3].data.display_name : "";
  await saveCloudAll();
  if (progress.must_change_password) openAccountModal("reset");
}
async function saveCloudAll() {
  if (!supabaseClient || !account.user) return;
  const userId = account.user.id;
  const highScores = loadStoredValue("highScores", {});
  const rows = [];
  const entryKeys = Object.keys(highScores);
  for (let index = 0; index < entryKeys.length; index++) {
    const entry = highScores[entryKeys[index]];
    const splitAt = entryKeys[index].lastIndexOf("_");
    rows.push({ user_id: userId, song_key: entryKeys[index].slice(0, splitAt), difficulty: entryKeys[index].slice(splitAt + 1), score: entry.score, max_combo: entry.maxCombo, rank: entry.rank, play_count: entry.playCount, updated_at: new Date().toISOString() });
  }
  try {
    const requests = [
      supabaseClient.from("user_progress").upsert({ user_id: userId, story_progress: loadStoredValue("storyProgress", 0), sound_shards: loadStoredValue("soundShards", 0), updated_at: new Date().toISOString() }),
      supabaseClient.from("user_settings").upsert({ user_id: userId, settings: { values: settings, keys: keyBindings }, updated_at: new Date().toISOString() }),
    ];
    if (rows.length > 0) requests.push(supabaseClient.from("high_scores").upsert(rows, { onConflict: "user_id,song_key,difficulty" }));
    const results = await Promise.all(requests);
    for (let index = 0; index < results.length; index++) { if (results[index].error) throw results[index].error; }
  } catch (error) { syncFailedUntil = performance.now() + 4000; }
}
function deleteAccountLocalData() {
  for (let index = 0; index < accountStoredNames.length; index++) localStorage.removeItem(accountStoragePrefix + accountStoredNames[index]);
}
async function startLogout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  deleteAccountLocalData();
  account.user = null; account.displayName = "";
  storageKeyPrefix = guestStoragePrefix;
  loadSettings();
}
async function startDeleteData() {
  if (!window.confirm("ハイスコアと設定を削除します。よろしいですか？")) return;
  const names = ["high_scores", "user_progress", "user_settings"];
  if (supabaseClient && account.user) {
    for (let index = 0; index < names.length; index++) await supabaseClient.from(names[index]).delete().eq("user_id", account.user.id);
  }
  for (let index = 0; index < accountStoredNames.length; index++) localStorage.removeItem(storageKeyPrefix + accountStoredNames[index]);
  Object.assign(settings, defaultSettings);
}
function checkLoginState() {
  if (!supabaseClient) return;
  supabaseClient.auth.getSession().then(function (result) { if (result.data.session) startAccountSession(result.data.session.user); }).catch(function () {});
}

/* ===== メインループ =====
   毎フレーム: 前フレームのボタン一覧に切り替え → 更新（プレイ中のみ）→ 現在の画面を描画。
   フレーム間隔は最大100msに抑え、タブ復帰時のワープを防ぐ */
let previousTimestamp = null;
function runFrame(timestamp) {
  const deltaMilliseconds = previousTimestamp === null ? 0 : Math.min(100, timestamp - previousTimestamp);
  previousTimestamp = timestamp;
  buttonList = nextButtonList;
  nextButtonList = [];
  if (currentScene === "play") updatePlay(deltaMilliseconds);
  if (currentScene === "loading") drawLoadingScene(timestamp);
  else if (currentScene === "title") drawTitleScene();
  else if (currentScene === "songSelect") drawSongSelectScene();
  else if (currentScene === "play") drawPlayScene();
  else if (currentScene === "result") drawResultScene();
  else if (currentScene === "settings") drawSettingsScene();
  else if (currentScene === "story") drawStoryScene();
  if (performance.now() < syncFailedUntil) drawText("同期できませんでした", 20, 1050, 28, "left", "#ffb3c0");
  requestAnimationFrame(runFrame);
}
loadSettings();
checkLoginState();
startLoadingAssets();
requestAnimationFrame(runFrame);
