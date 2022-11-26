import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import RootRouter from "./routes";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.disable("x-powered-by"); // anti-skid (ish?)
app.use(
    cors({
        credentials: true,
        origin: [
            "http://localhost:3000", // development
            process.env.FRONTEND_URI,
        ],
    })
);

app.use("/", RootRouter);

export default function listen(port: number) {
    return new Promise<void>((resolve) => app.listen(port, resolve));
}
