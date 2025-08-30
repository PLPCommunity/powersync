// shim re-export to satisfy TS imports from .tsx files

import { useEffect } from "react";
// import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import googleIcon from "../assets/google-icon.png";
import github from "../assets/github.png";
import { auth, gitProvider, provider } from "../utils/firebase";
import { useDispatch, useSelector } from "react-redux";
import { login, logout, selectUser } from "../features/userSlice";
// import GitHubIcon from "@mui/icons-material/GitHub";
// import GitHubIcon from "@mui/icons-material/GitHub";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const Login = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const navigate = useNavigate();

  // SIGN IN WITH GOOGLE

  const googleSignIn = () => {
    auth
      .signInWithPopup(provider)
      .then((result) => {
        dispatch(
          login({
            displayName: result.user.displayName,
            email: result.user.email,
          })
        );
      })
      .then(() => {
        window.location.reload(false);
        navigate("/boards");
      })
      .catch((error) => {
        alert(error.message);
      });
  };

  // SIGN IN WITH GITHUB

  const githubSignUp = (e) => {
    e.preventDefault();
    auth
      .signInWithPopup(gitProvider)
      .then((result) => {
        dispatch(
          login({
            displayName: result.user.displayName,
            email: result.user.email,
          })
        );
      })
      .then(() => {
        window.location.reload(false);
      })
      .catch((error) => {
        alert(error.message);
      });
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (userAuth) => {
      if (userAuth) {
        dispatch(
          login({
            email: userAuth.email,
            uid: userAuth.uid,
            displayName: userAuth.displayName,
          })
        );
      } else {
        dispatch(logout());
      }
    });

    return unsubscribe;
  }, [dispatch]);

  return (
    <main className="">
      <button
        type="button"
        onClick={() => {
          console.log("Hello world");
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:from-indigo-500 hover:to-purple-500 cursor-pointer"
        data-hs-overlay="#hs-static-backdrop-modal"
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </button>
      <div
        id="hs-static-backdrop-modal"
        className="hs-overlay hidden w-full z-[100] h-full fixed top-0 left-0 overflow-x-hidden overflow-y-auto  bg-white bg-opacity-100 backdrop-blur-xs"
        data-hs-overlay-keyboard="false"
      >
        <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 md:mt-24 opacity-100 ease-out transition-all sm:max-w-4xl w-full m-3 mx-auto">
          <div className=" bg-white mx-auto w-full md:w-4/6 rounded-xl md:shadow-md md:border-2 mt-28 md:mt-24">
            <div className="flex justify-between items-center py-3 px-4 border-b">
              <h3 className="font-bold text-gray-900">Mossara</h3>
              <button
                type="button"
                className="hs-dropdown-toggle inline-flex flex-shrink-0 justify-center items-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-400 transition-all text-sm cursor-pointer"
                data-hs-overlay="#hs-static-backdrop-modal"
                onClick={() => window.location.reload()}
              >
                {/* <CloseOutlinedIcon className="w-20" /> */} X
              </button>
            </div>

            <div className="my-10 w-4/5 md:p-5 mx-auto items-center ">
              <h1 className="text-2xl text-center text-gray-800 font-bold">
                Welcome to Mossara
              </h1>

              <section className=" w-full mx-auto mt-5  sm:p-5 md:p-5 lg:p-6 index-50 bg-white space-y-5 ">
                <div
                  onClick={googleSignIn}
                  className="flex items-center justify-center mx-auto w-full text-yellow-600 font-semibold border border-gray-500 rounded-full cursor-pointer mt-4"
                >
                  <img src={googleIcon} className="w-14" alt="" />
                  <p className="">Sign up with Google </p>
                </div>
                <div
                  onClick={githubSignUp}
                  className="flex items-center justify-center font-serif mx-auto w-full p-2 py-3 border font-semibold border-gray-500 rounded-full cursor-pointer mt-4"
                >
                  <img src={github} className="w-6" alt="" />
                  {/* <GitHubIcon className="w-24" /> */}
                  <p className="ml-5 ">Sign up with GitHub </p>
                </div>
              </section>
              <p className="font-light text-xs text-center mt-8">
                By clicking “Sign up” you agree to Mossara’s{" "}
                <a
                  className="underline"
                  href="https://progskill.com/terms"
                  target="_blank"
                >
                  Terms of Use
                </a>{" "}
                and acknowledge that Progskill’s{" "}
                <a
                  className="underline"
                  href="https://progskill.com/privacy-policy"
                  target="_blank"
                >
                  Privacy Policy
                </a>{" "}
                applies to you.
              </p>
            </div>
            <button
              type="button"
              className="hs-dropdown-toggle py-3 px-6 w-full inline-flex justify-center items-center gap-2 rounded-md border bg-white text-gray-700 shadow-sm align-middle hover:bg-gray-100 transition-all text-sm font-bold "
              data-hs-overlay="#hs-static-backdrop-modal"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
