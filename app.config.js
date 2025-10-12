import 'dotenv/config';

export default {
  expo: {
    name: "school-app",
    slug: "school-app",
    version: "1.0.0",
    extra: {
      backendUrl: process.env.BACKEND_URL,
    },
  },
};