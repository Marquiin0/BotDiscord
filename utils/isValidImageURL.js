function isValidImageURL(str) {
    return /(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png|jpeg)/.test(str);
}

module.exports = { isValidImageURL };