import { create } from "zustand";
import { persist } from "zustand/middleware";


function getInitialState() {
  if (typeof window === "undefined") {
    return { user: null, token: null, isAuthenticated: false };
  }
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state;
      if (state?.user && state?.token && state?.isAuthenticated) {
        return {
          user: state.user,
          token: state.token,
          isAuthenticated: true,
        };
      }
    }
  } catch (e) {
    
  }
  return { user: null, token: null, isAuthenticated: false };
}

const initial = getInitialState();

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: initial.user,
      token: initial.token,
      isAuthenticated: initial.isAuthenticated,

      
      setAuth: ({ user, token }) => {
        set({
          user,
          token,
          isAuthenticated: true,
        });
      },

      
      clearAuth: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      
      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }));
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

export default useAuthStore;
