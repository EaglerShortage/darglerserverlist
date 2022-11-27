import { Router, Request, Response } from "express";
import prisma from "../db";
import axios from "axios";
import { daysFromNow, randomString } from "../utils";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
    if (!req.query || !req.query.code)
        return res.status(400).json({
            success: false,
            message: "Missing query parameter 'code' in request.",
        });

    const { code } = req.query;
    let oauthResult;
    try {
        oauthResult = await axios.post(
            `https://discord.com/api/oauth2/token`,
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code as string,
                redirect_uri: process.env.OAUTH_REDIRECT_URI,
                // scope: "identify",
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            },
        );
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid OAuth code provided.",
        });
    }
    if (!oauthResult || !oauthResult.data || !oauthResult.data.access_token)
        return res.status(401).json({
            success: false,
            message: "Invalid OAuth code provided.",
        });

    const { access_token: accessToken, token_type: tokenType } =
        oauthResult.data;
    let user;
    try {
        user = await axios.get("https://discord.com/api/users/@me", {
            headers: {
                authorization: `${tokenType} ${accessToken}`,
            },
        });
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid OAuth code provided.",
        });
    }
    if (!user || !user.data || !user.data.id)
        return res.status(400).json({
            success: false,
            message: "An unknown error occurred. Please contact a developer.",
        });

    user = user.data;
    let lookup = await prisma.user.findUnique({
        where: {
            discordId: user.id,
        },
    });

    if (!lookup)
        lookup = await prisma.user.create({
            data: {
                discordId: user.id,
                username: user.username,
            },
        });
    
    if (lookup.username !== user.username)
        lookup = await prisma.user.update({
            where: {
                discordId: user.id,
            },
            data: {
                username: user.username,
            },
        });

    let session = await prisma.session.findFirst({
        where: {
            userId: lookup.uuid,
        },
    });

    if (session) {
        res.cookie("session", session.sessionString);
        return res.json({
            success: true,
            message: "Logged in successfully.",
        });
    }

    prisma.session.create({
        data: {
            sessionString: randomString(90),
            userId: lookup.uuid,
            expiresAt: daysFromNow(1),
        },
    }).then((session) => {
        res.cookie("session", session.sessionString);
        return res.json({
            success: true,
            message: "Logged in successfully.",
        });
    }).catch((err) => {
        let s = randomString(20);
        console.log(`Error occurred with ID ${s}:`);
        console.log(err);
        res.status(500).json({
            success: true,
            message: `An internal error occurred with ID ${s}.`,
        });
    });
});

export default router;
