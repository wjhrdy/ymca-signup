import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.DEV ? '' : window.location.origin,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;
