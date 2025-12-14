const axiosMock = {
  post: jest.fn(),
};

export default axiosMock;
export const post = axiosMock.post;
