export function startClock() {
    setInterval(() => {
      const time = document.querySelector(".display #time");
      const dateDisplay = document.querySelector(".display #date");
      let date = new Date();
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hours = date.getHours();
      let minutes = date.getMinutes();
      let seconds = date.getSeconds();
      let day_night = "AM";
  
      if (hours > 12) {
        day_night = "PM";
        hours = hours - 12;
      }
      if (seconds < 10) seconds = "0" + seconds;
      if (minutes < 10) minutes = "0" + minutes;
      if (hours < 10) hours = "0" + hours;
  
      dateDisplay.textContent = `${day}-${month}-${year}`;
      time.textContent = `${hours}:${minutes}:${seconds} ${day_night}`;
    });
}
  