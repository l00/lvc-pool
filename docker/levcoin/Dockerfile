# Builds levcoind and simplewallet with the toolchain this 2016 code needs
# (Ubuntu 16.04: GCC 5.4, Boost 1.58, CMake 3.5). Build context: repo root.

FROM ubuntu:16.04 AS build
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential cmake libboost-all-dev python \
    && rm -rf /var/lib/apt/lists/*
COPY levcoin /src
WORKDIR /src/build
# arch=default targets generic x86-64 + aes instead of -march=native, so the binaries run on other cpus
RUN cmake -DCMAKE_BUILD_TYPE=Release -DSTATIC=ON -DARCH=default .. \
 && make -j"$(nproc)" Daemon SimpleWallet \
 && strip src/levcoind src/simplewallet

FROM ubuntu:16.04
RUN useradd -m -u 1000 levcoin
COPY --from=build /src/build/src/levcoind /src/build/src/simplewallet /usr/local/bin/
USER levcoin
WORKDIR /home/levcoin
EXPOSE 21724 21725
ENTRYPOINT ["levcoind"]
CMD ["--rpc-bind-ip=0.0.0.0", "--rpc-bind-port=21725", "--p2p-bind-port=21724"]
