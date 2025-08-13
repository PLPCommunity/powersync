import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/performance";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
// import { getPerformance } from "firebase/performance";

const firebaseApp = firebase.initializeApp({
  apiKey: "AIzaSyDGPbi61TNV7Rp1sbTJQYx_wYw62Zb5NXQ",
  authDomain: "cryptolearn-6f81b.firebaseapp.com",
  projectId: "cryptolearn-6f81b",
  storageBucket: "cryptolearn-6f81b.appspot.com",
  messagingSenderId: "742531451792",
  appId: "1:742531451792:web:80cfb191d5842d2be9c115",
  measurementId: "G-XQJNVH2X3K",
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