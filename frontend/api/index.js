import Axios, { Method } from "axios";

class API {
    async request({ endpoint, method, body, headers }) {
        return new Promise((resolve, reject) => {
            Axios({
                url: `${process.env.NEXT_PUBLIC_BACKEND_URI}${endpoint}`,
                method: method ?? "GET",
                data: body ?? null,
                headers,
                withCredentials: true,
            })
                .then(({ data }) => resolve(data))
                .catch(reject);
        });
    }

    async getUser() {
        return await this.request({
            endpoint: "/users/@me",
        });
    }

    async getSpecificUser(uuid) {
        return await this.request({
            endpoint: `/users/${uuid}`,
        });
    }

    async getServer(uuid) {
        return await this.request({
            endpoint: `/servers/${uuid}`,
        });
    }

    async getServers(page) {
        return await this.request({
            endpoint: `/servers?page=${page}`,
        });
    }

    async logout() {
        return await this.request({
            endpoint: "/oauth/logout",
        });
    }

    async postComment({ uuid, content, captcha }) {
        return await this.request({
            endpoint: `/servers/${uuid}`,
            method: "POST",
            body: {
                content,
                captcha,
            },
        });
    }

    async vote({ id, captcha, value }) {
        return await this.request({
            endpoint: `/servers/${id}/vote`,
            method: "POST",
            body: {
                captcha,
                value,
            },
        });
    }
}

export default new API();
