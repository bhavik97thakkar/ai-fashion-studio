import { User } from "../types";

declare global {
  interface Window {
    google: any;
  }
}

export const parseJwt = (token: string) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

export const initGoogleAuth = (
  clientId: string,
  onUserAuthenticated: (user: User) => void,
) => {
  if (!window.google?.accounts?.id) {
    console.warn("Google Accounts SDK not loaded yet.");
    return;
  }

  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: any) => {
        const payload = parseJwt(response.credential);
        if (payload) {
          onUserAuthenticated({
            id: payload.sub,
            name: payload.name,
            email: payload.email,
            photoUrl: payload.picture,
          });
        }
      },
      auto_select: false,
      use_fedcm_for_prompt: false,
    });
  } catch (err) {
    console.error("GIS Initialization Error:", err);
  }
};

export const renderGoogleButton = (containerId: string) => {
  // Wait for SDK and DOM element to be ready
  const checkInterval = setInterval(() => {
    const container = document.getElementById(containerId);
    if (window.google?.accounts?.id && container) {
      clearInterval(checkInterval);
      try {
        window.google.accounts.id.renderButton(container, {
          theme: "filled_black",
          size: "large",
          width: 250,
          text: "signin_with",
          shape: "pill",
        });
      } catch (err) {
        console.error("Button Render Error:", err);
      }
    }
  }, 200);

  // Clear interval after 5 seconds to prevent memory leaks
  setTimeout(() => clearInterval(checkInterval), 5000);
};

export const signOutGoogle = () => {
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
};
