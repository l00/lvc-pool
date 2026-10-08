FROM node:18-bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential python3 git libboost-system-dev libboost-date-time-dev libsodium-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /pool
COPY pool/package.json pool/package-lock.json ./
# the hashing modules hardcode -march=native and probe the build cpu for avx; build them for
# x86-64-v2 + aes instead so the image runs on cpus without avx
RUN npm ci --omit=dev --ignore-scripts \
 && sed -i -e "s/'-march=native'/'-march=x86-64-v2', '-maes'/g" -e "s/-march=native/-march=x86-64-v2 -maes/g" \
      node_modules/cryptonight-hashing/binding.gyp node_modules/cryptoforknote-util/binding.gyp \
 && ! grep -rl "march=native" node_modules/*/binding.gyp \
 && printf '#!/bin/sh\n# reports the target cpu instead of the build machine\ncase "$1" in intel|sse2|ssse3|sse4_1|sse4_2|popcnt|aes) exit 0 ;; *) exit 1 ;; esac\n' \
      > node_modules/cryptonight-hashing/check_cpu.sh \
 && npm rebuild
COPY pool/ ./
USER node
ENTRYPOINT ["node", "init.js"]
CMD ["-config=/config/config.json"]
