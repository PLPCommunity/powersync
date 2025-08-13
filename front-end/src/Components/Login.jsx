import { useEffect } from "react";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
// import googleIcon from "../assets/google-icon.png";
import { auth, gitProvider, provider } from "../utils/firebase";
import { useDispatch, useSelector } from "react-redux";
import { login, logout, selectUser } from "../features/userSlice";
// import GitHubIcon from "@mui/icons-material/GitHub";

const Login = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);

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
        // const role = await fetchUserRole(userAuth);
        dispatch(
          login({
            email: userAuth.email,
            uid: userAuth.uid,
            displayName: userAuth.displayName,
            // role: role, // Include role in the payload
          })
        );
      } else {
        dispatch(logout());
      }
    });

    return unsubscribe;
  }, [dispatch]);

  return (
    <main>
      <button
        type="button"
        className="bg-pink-600 border border-pink-600 hover:bg-transparent rounded-full py-2 px-8 text-white hover:text-pink-600"
        data-hs-overlay="#hs-static-backdrop-modal"
      >
        Sign up
      </button>
      <div
        id="hs-static-backdrop-modal"
        className="hs-overlay hidden w-full z-[100] h-full fixed top-0 left-0 overflow-x-hidden overflow-y-auto  bg-white bg-opacity-100 backdrop-blur-xs"
        data-hs-overlay-keyboard="false"
      >
        <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 md:mt-24 opacity-100 ease-out transition-all sm:max-w-4xl w-full m-3 mx-auto">
          <div className=" bg-white mx-auto w-full md:w-4/6 rounded-xl md:shadow-md md:border-2 mt-28 md:mt-24">
            <div className="flex justify-between items-center py-3 px-4 border-b">
              <h3 className="font-bold text-gray-900">Progskill</h3>
              <button
                type="button"
                className="hs-dropdown-toggle inline-flex flex-shrink-0 justify-center items-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-400 transition-all text-sm"
                data-hs-overlay="#hs-static-backdrop-modal"
              >
                {/* <CloseOutlinedIcon className="w-20" /> */}X
              </button>
            </div>

            <div className="my-10 w-4/5 md:p-5 mx-auto items-center ">
              <h1 className="text-2xl text-center text-gray-800 font-bold">
                Welcome to Progskill
              </h1>

              <section className=" w-full mx-auto mt-5  sm:p-5 md:p-5 lg:p-6 index-50 bg-white space-y-5 ">
                <div
                  onClick={googleSignIn}
                  className="flex items-center justify-center mx-auto w-full text-yellow-600 border border-gray-500 rounded-full cursor-pointer mt-4"
                >
                  {/* <img src={googleIcon} className="w-12" alt="" /> */}
                  <p className="">Sign up with Google </p>
                </div>
                <div
                  onClick={githubSignUp}
                  className="flex items-center justify-center font-serif mx-auto w-full p-2 border border-gray-500 rounded-full cursor-pointer mt-4"
                >
                  {/* <GitHubIcon className="w-24" /> */}
                  <p className="ml-5 ">Sign up with GitHub </p>
                </div>
              </section>
              <p className="font-light text-xs text-center mt-8">
                By clicking “Sign up” you agree to Progskill’s{" "}
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
