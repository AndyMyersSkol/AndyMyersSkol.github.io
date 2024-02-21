function setActive(element) {
    var links = document.querySelectorAll('nav li a');
    links.forEach(function(link) {
        link.classList.remove('active');
    });
    element.classList.add('active');
}
