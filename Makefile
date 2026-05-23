.PHONY: setup run test lint typecheck build clean

setup:
	npm install

run:
	npm run dev

test:
	echo "No tests yet — Wave 6 wires Playwright e2e."

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

clean:
	rm -rf .next out node_modules next-env.d.ts tsconfig.tsbuildinfo
