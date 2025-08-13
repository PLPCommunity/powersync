import { configureStore } from "@reduxjs/toolkit";
import userReducer from "../features/userReducer

export const store = configureStore({
  reducer: {
    user: userReducer,
  },
});