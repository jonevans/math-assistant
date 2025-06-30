import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
// Remove the jwt-decode import and use our own implementation

interface User {
  email: string;
  name: string;
  picture?: string;
}

interface JwtPayload {
  _id: string;
  email: string;
  exp: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (googleToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Simple function to decode JWT without using external libraries
function decodeJwt(token: string): JwtPayload {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    throw new Error('Invalid token format');
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Configure axios with auth token
  const setupAxiosAuth = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  // Check if token is expired
  const isTokenExpired = (token: string): boolean => {
    try {
      const decoded = decodeJwt(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp < currentTime;
    } catch (error) {
      return true; // If decoding fails, consider token expired
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        console.log('Token expired, logging out');
        logout();
      } else {
        // Token still valid, setup axios and set user from local storage
        setupAxiosAuth(token);
        
        // Try to get user info from localStorage to avoid an extra API call
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
            setIsAuthenticated(true);
          } catch (error) {
            console.error('Failed to parse saved user data', error);
            logout();
          }
        } else {
          // If no saved user, get fresh user data
          refreshUserInfo(token);
        }
      }
    }
  }, []);

  // Get fresh user info with the token
  const refreshUserInfo = async (token: string) => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/auth/me`);
      setUser(response.data);
      setIsAuthenticated(true);
      localStorage.setItem('user', JSON.stringify(response.data));
    } catch (error) {
      console.error('Failed to refresh user info', error);
      logout();
    }
  };

  const login = async (googleToken: string) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/auth/google`, { token: googleToken });
      
      // Store the JWT token, not the Google token
      const jwtToken = response.data.token;
      localStorage.setItem('token', jwtToken);
      
      // Save user data to localStorage
      const userData = {
        email: response.data.email,
        name: response.data.name,
        picture: response.data.picture
      };
      localStorage.setItem('user', JSON.stringify(userData));
      
      setupAxiosAuth(jwtToken);
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Login error:', error);
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setupAxiosAuth(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}; 