// Generate random room name if needed
// if (!location.hash) {
//   location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
// }
// const roomHash = location.hash.substring(1);

const roomHash = '44a5eb';

const drone = new ScaleDrone('2xmbUiTsqTzukyf7'); // my own, remove for publication
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;

const SCENES = [
  {
    msg: "👀 Looking for another player…",
    msgFr: "A la recherche d'un autre joueur...",
    timeout: 30, // seconds
  },
  {
    msg: "✅ Accepting the challenge…",
    msgFr: "Challenge accepté",
    timeout: 5, // seconds
  },
  {
    msg: "📯 Start!",
    msgFr: "Start!",
    timeout: 90, // seconds
  },
  {
    msg: "👏 You did great! Now do something silly!",
    msgFr: "Bien joué! Maintenant, éclate-toi ;)",
    timeout: 15, // seconds
  },
  {
    msg: "👋 Wave hi",
    msgFr: "Fais Coucou",
    timeout: 60, // seconds
  }
]

let CURRENT_SCENE_OBJ = {}
let CURRENT_SCENE_IDX = 0
let TIME_LEFT_IN_SCENE = -1;


function runtime() {
  // start timer
  goToScene(SCENES[CURRENT_SCENE_IDX]);
};


function updateTimeLeft() {
  if (TIME_LEFT_IN_SCENE < 60) {
    var minutes = 0;
    var seconds = TIME_LEFT_IN_SCENE;
  } else {
    var minutes = Math.floor(TIME_LEFT_IN_SCENE / 60 );
    var seconds = (TIME_LEFT_IN_SCENE % 60 );
  } 

  if (seconds < 10) {
    var secondsStr = '0' + seconds.toString();
  } else {
    var secondsStr = seconds.toString();
  }

  var timeStr = minutes.toString() + ':' + secondsStr;

  document.querySelector('#timeRemaining').textContent = timeStr;
  if (TIME_LEFT_IN_SCENE > 0) {
    // console.log('Time left in scene: ' + TIME_LEFT_IN_SCENE);
    setTimeout(updateTimeLeft, 1 * 1000); // update 4x per second
    TIME_LEFT_IN_SCENE = TIME_LEFT_IN_SCENE - 1;

    if (TIME_LEFT_IN_SCENE < 1) {
      clearTimeout(updateTimeLeft);
    }
  } else {
    // console.log('No time left in scene: ' + TIME_LEFT_IN_SCENE);
    clearTimeout(updateTimeLeft);
  }
};

function setMessage(msg, lang) {
  if (lang === 'en') {
    var selector = '#announceLabelEN';
  } else {
    var selector = '#announceLabelFR';
  }

  document.querySelector(selector).textContent = msg;
}

function sceneEnded() {
  nextSceneIdx = CURRENT_SCENE_IDX + 1;
  if (nextSceneIdx == SCENES.length) {
    CURRENT_SCENE_IDX = 0;
  } else {
    CURRENT_SCENE_IDX = nextSceneIdx;
  }

  goToScene(SCENES[CURRENT_SCENE_IDX]);
}

function setSceneTimeout(timeout) {
  setTimeout(sceneEnded, (timeout * 1000) + 1000); 
  
  // also set the visible timer
  TIME_LEFT_IN_SCENE = timeout;
  updateTimeLeft()
}

function goToScene(scene) {
  CURRENT_SCENE_OBJ = scene

  setMessage(scene.msg, 'en');
  setMessage(scene.msgFr, 'fr');
  setSceneTimeout(scene.timeout);
};

function onSuccess() { 
  runtime();
};

function onError(error) {
  console.error(error);
};

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({ 'candidate': event.candidate });
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.onaddstream = event => {
    remoteVideo.srcObject = event.stream;
  };

  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  }).then(stream => {
    // Display your local video in #localVideo element
    // localVideo.srcObject = stream;
    // remoteVideo.srcObject = stream;
    // Add your stream to be sent to the conneting peer
    pc.addStream(stream);
  }, onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({ 'sdp': pc.localDescription }),
    onError
  );
}

runtime();
