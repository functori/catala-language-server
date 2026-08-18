opam update
opam upgrade -y catala
opam remove catala-lsp 
opam pin remove catala-lsp
opam pin add -y catala-lsp /home/arnaud/catala-language-server#HEAD