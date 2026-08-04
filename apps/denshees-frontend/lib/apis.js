import instance from "./axios";

export async function get(url) {
  return instance.get(url);
}

export async function post(url, { arg } = {}) {
  return instance.post(url, arg);
}

export async function patch(url, { arg } = {}) {
  return instance.patch(url, arg);
}

export async function remove(url) {
  return instance.delete(url);
}
