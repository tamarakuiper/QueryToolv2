// src/api.js
import axios from "axios";
import { getApiBase } from "./config";


// Backend API base URL
export const api = axios.create({
    baseURL: getApiBase(), // adjust to your backend port
    withCredentials: true, // include cookies for auth
});

// Optional: handle auth refresh or errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // not authenticated - optional redirect or logout
            console.warn("Not authenticated");
        }
        return Promise.reject(error);
    }
);

