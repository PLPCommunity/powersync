import { createSlice } from "@reduxjs/toolkit";

export const userSlice = createSlice({
  name: "user",

  initialState: {
    user: null,
    isAdmin: false,
  },

  reducers: {
    login: (state, action) => {
      state.user = action.payload;
    },

    logout: (state) => {
      state.user = null;
    },
    setIsAdmin: (state, action) => {
      state.isAdmin = action.payload;
    },
  },
});
export const { setIsAdmin } = userSlice.actions;

export const { login, logout } = userSlice.actions;

export const selectUser = (state) => state.user.user;
export const selectIsAdmin = (state) => state.user.isAdmin;

export default userSlice.reducer;