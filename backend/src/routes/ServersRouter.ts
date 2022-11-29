import prisma from "../db";
import { Router, Request, Response } from "express";
import { User } from "../middleware";
import { daysFromNow, randomString, validateCaptcha } from "../utils";
import { WebSocket } from "ws";
import { createHash } from "crypto";
import rateLimit from "express-rate-limit";

const router = Router();
const validWssRegex = /^(wss?:\/\/)([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[^\/]+)/;

router.get("/", async (_req: Request, res: Response) => {
    const servers = await prisma.server.findMany({
        where: {
            disabled: false,
        },
        select: {
            uuid: true,
            name: true,
            verified: true,
            address: true,
            votes: true,
        },
    });

    return res.json({
        success: true,
        message: `Successfully retrieved ${servers.length} servers.`,
        data: servers,
    });
});

router.get("/@me", User, async (req: Request, res: Response) => {
    const servers = await prisma.server.findMany({
        where: {
            owner: req.user.uuid,
        },
    });

    return res.json({
        success: true,
        message: `Successfully retrieved ${servers.length} servers.`,
        data: servers,
    });
});

router.get("/:uuid", async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        select: {
            comments: {
                select: {
                    content: true,
                    poster: true,
                    posterName: true,
                    postedAt: true,
                },
            },
            uuid: true,
            name: true,
            description: true,
            address: true,
            createdAt: true,
            disabled: true,
            verified: true,
            owner: true,
            updatedAt: true,
            votes: true,
        },
    });

    if (!server)
        return res.status(404).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    return res.json({
        success: true,
        message: "Successfully fetched data for server " + server.uuid,
        data: server,
    });
});

router.get("/:uuid/full", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
        select: {
            comments: {
                select: {
                    content: true,
                    poster: true,
                    postedAt: true,
                },
            },
            uuid: true,
            name: true,
            description: true,
            address: true,
            createdAt: true,
            disabled: true,
            verified: true,
            owner: true,
            updatedAt: true,
            votes: true,
            code: true,
        },
    });
    if (server.owner !== req.user.uuid && !req.user.admin) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to view this information.",
        });
    }
    return res.json({
        success: true,
        message: "Successfully fetched data for server " + server.uuid,
        data: server,
    });
});

router.post(
    "/",
    rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
    }),
    User,
    async (req: Request, res: Response) => {
        if (!req.body)
            return res.status(400).json({
                success: false,
                message: "Request did not contain a body.",
            });

        const { name, description, address } = req.body;

        if (!name || !description || !address)
            return res.status(400).json({
                success: false,
                message: "The request is missing one or more required fields.",
            });

        if (!validWssRegex.test(address))
            return res.status(400).json({
                success: false,
                message: "The address specified is invalid.",
            });

        if (name.length > 100)
            return res.status(400).json({
                success: false,
                message: "The server name specified is too long!",
            });

        if (description.length > 1500)
            return res.status(400).json({
                success: false,
                message: "The description specified is too long!",
            });

        const nameLookup = await prisma.server.findFirst({
            where: {
                owner: req.user.uuid,
                name,
            },
        });

        if (nameLookup)
            return res.status(400).json({
                success: false,
                message: "You cannot create two servers with the same name.",
            });

        const addressLookup = await prisma.server.findFirst({
            where: {
                address,
            },
        });

        if (addressLookup)
            return res.status(400).json({
                success: false,
                message: "A server already exists with this address.",
            });

        const server = await prisma.server.create({
            data: {
                name,
                description,
                address,
                owner: req.user.uuid,
                code: randomString(10, "0123456789abcdef"),
            },
        });

        return res.json({
            success: true,
            message: "The server was successfully created.",
            data: server,
        });
    }
);

router.post("/:uuid", User, async (req: Request, res: Response) => {
    if (!req.body)
        return res.status(400).json({
            success: false,
            message: "Request did not contain a body.",
        });

    const { content, captcha } = req.body;

    if (!content || !captcha)
        return res.status(400).json({
            success: false,
            message: "The request was missing one or more required fields.",
        });

    if (content.length > 200)
        return res.status(400).json({
            success: false,
            message: "Comments may not exceed 200 characters.",
        });

    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "Could not find a server with that UUID.",
        });

    try {
        await validateCaptcha(captcha);
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Invalid CAPTCHA response.",
        });
    }

    await prisma.comment.create({
        data: {
            content,
            serverId: server.uuid,
            poster: req.user.uuid,
            posterName: req.user.username,
        },
    });

    return res.json({
        success: true,
        message: "Comment successfully posted.",
    });
});

router.put("/:uuid", User, async (req: Request, res: Response) => {
    if (!req.body)
        return res.status(400).json({
            success: false,
            message: "Request did not contain a body.",
        });

    const { name, description } = req.body;

    if (!name && !description)
        return res.status(400).json({
            success: false,
            message: "No fields specified that can be updated.",
        });

    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(404).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (server.owner !== req.user.uuid && !req.user.admin)
        return res.status(403).json({
            success: false,
            message:
                "You do not have permission to update other users' servers.",
        });

    const newServer = await prisma.server.update({
        where: {
            uuid: server.uuid,
        },
        data: {
            name: name ?? server.name,
            description: description ?? server.description,
            updatedAt: new Date(),
        },
    });
    delete newServer.code;

    return res.json({
        success: true,
        message: "Successfully updated server.",
        data: server,
    });
});

router.post("/:uuid/vote", User, async (req: Request, res: Response) => {
    if (!req.body)
        return res.status(400).json({
            success: false,
            message: "Request did not specify a body.",
        });

    const { captcha } = req.body;

    if (!captcha)
        return res.status(400).json({
            success: false,
            message: "Nice try. (missing captcha in request body)",
        });

    try {
        await validateCaptcha(captcha);
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Invalid CAPTCHA response.",
        });
    }

    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (!server.verified)
        return res.status(400).json({
            success: false,
            message: "You may not vote for a server that is unverified.",
        });

    if (server.disabled)
        return res.status(400).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    const cooldown = await prisma.voteCooldown.findFirst({
        where: {
            userId: req.user.uuid,
            serverId: server.uuid,
        },
    });

    if (cooldown)
        return res.status(400).json({
            success: false,
            message: "You are currently on a vote cooldown.",
        });

    await prisma.server.update({
        where: {
            uuid: server.uuid,
        },
        data: {
            votes: {
                increment: 1,
            },
        },
    });

    await prisma.voteCooldown.create({
        data: {
            userId: req.user.uuid,
            serverId: server.uuid,
            expiresAt: daysFromNow(1),
        },
    });

    return res.json({
        success: true,
        message:
            "Successfully voted for this server. You can vote again in 24 hours.",
    });
});

router.delete("/:uuid", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(400).json({
            success: false,
            message: "Could not find a server with that UUID.",
        });

    if (server.owner !== req.user.uuid && !req.user.admin)
        return res.status(403).json({
            success: false,
            message:
                "You do not have permission to delete other users' servers.",
        });

    await prisma.server.delete({
        where: {
            uuid: req.params.uuid,
        },
    });

    return res.json({
        success: true,
        message: "Successfully deleted server.",
    });
});

router.post("/:uuid/verify", User, async (req: Request, res: Response) => {
    const server = await prisma.server.findUnique({
        where: {
            uuid: req.params.uuid,
        },
    });

    if (!server)
        return res.status(404).json({
            success: false,
            message: "A server with that UUID could not be found.",
        });

    if (server.verified)
        return res.status(400).json({
            success: false,
            message: "This server has already been verified.",
        });

    if (server.owner !== req.user.uuid && !req.user.admin)
        return res.status(403).json({
            success: false,
            message: "You do not have permission to verify this server.",
        });

    try {
        const ws = await new WebSocket(server.address);
        let shasum = createHash("sha1");
        let msg = "";
        ws.onopen = async () =>
            ws.send("Accept: " + shasum.update(server.code).digest("hex"));
        ws.onmessage = async (message) => (msg = message.data.toString());
        ws.close = async () => {
            if (msg == "OK") {
                await prisma.server.update({
                    where: {
                        uuid: server.uuid,
                    },
                    data: {
                        verified: true,
                    },
                });
                return res.json({
                    success: true,
                    message: "Successfully verified server.",
                });
            } else
                return res.status(400).json({
                    success: false,
                    message: "Could not verify server, please try again!",
                });
        };
        ws.onerror = async () =>
            res.status(400).json({
                success: false,
                message: "Unable to verify server, please try again!",
            });
    } catch (_) {
        return res.status(400).json({
            success: false,
            message: "Unable to verify server, please try again!",
        });
    }
});

export default router;
