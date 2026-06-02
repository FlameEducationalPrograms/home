const introVideo = document.querySelector("#introVideo");
const videoControl = document.querySelector("#videoControl");
const soundControl = document.querySelector("#soundControl");

function updateVideoButton() {
  videoControl.textContent = introVideo.paused ? "Play Intro" : "Pause Intro";
  soundControl.textContent = introVideo.muted ? "Sound On" : "Sound Off";
}

videoControl.addEventListener("click", async () => {
  if (introVideo.paused) {
    await introVideo.play().catch(() => {});
  } else {
    introVideo.pause();
  }

  updateVideoButton();
});

soundControl.addEventListener("click", async () => {
  introVideo.muted = !introVideo.muted;

  if (!introVideo.muted && introVideo.paused) {
    await introVideo.play().catch(() => {});
  }

  updateVideoButton();
});

introVideo.addEventListener("play", updateVideoButton);
introVideo.addEventListener("pause", updateVideoButton);
introVideo.addEventListener("volumechange", updateVideoButton);
updateVideoButton();
