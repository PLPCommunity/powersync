import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/performance";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
// import { getPerformance } from "firebase/performance";

const firebaseApp = firebase.initializeApp({
  apiKey: "AIzaSyBqRGfNOCRA06URvZ8VD8Ny8paPTpuqCfw",
  authDomain: "mentorship-74ad7.firebaseapp.com",
  projectId: "mentorship-74ad7",
  storageBucket: "mentorship-74ad7.firebasestorage.app",
  messagingSenderId: "1035391211182",
  appId: "1:1035391211182:web:304c3b302b4433b8593f3f",
  measurementId: "G-LQ9EKJ7347"
});

const analytics = getAnalytics(firebaseApp);
logEvent(analytics, "click", {
  name: "Page_Clicked",
});

const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const gitProvider = new firebase.auth.GithubAuthProvider();
const perf = getPerformance(firebaseApp);

export { analytics, perf, auth, provider, gitProvider };