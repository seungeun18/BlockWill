# Devlog 03. 로컬 블록체인과 스마트 컨트랙트 실험 환경 구성

## 작업 목적

BlockWill의 디지털 유산 등록과 상속 과정을 실제 이더리움과 같은 환경에서 검증하기 위해 로컬 블록체인 개발 환경을 구성했다. 실제 자산을 사용하지 않고 Hardhat이 제공하는 테스트 ETH로 스마트 컨트랙트 동작을 확인했다.

## 개발 환경

- MetaMask
- Hardhat 3
- Remix IDE
- Solidity 0.8.20
- ethers.js
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`

## 구현 및 실험 내용

1. TypeScript, Mocha, ethers.js 기반 Hardhat 프로젝트를 생성했다.
2. Hardhat 로컬 노드를 실행해 테스트 계정과 가상 ETH를 생성했다.
3. MetaMask에 `BlockWill Local` 네트워크를 등록했다.
4. 테스트 계정 두 개를 각각 유산 소유자와 상속자 계정으로 구성했다.
5. 기존 `Will.sol`을 Remix에서 컴파일하고 로컬 Hardhat 네트워크에 배포했다.
6. `createWill`을 호출해 상속자 주소, 비활동 기준 블록 수, 테스트 문서 URI를 등록하고 1 ETH를 예치했다.
7. `willCount`와 `wills` 조회 함수로 다음 결과를 확인했다.

- 생성된 유언 수: 1
- 예치 금액: 1 ETH
- 상속 완료 여부: false
- 유언 데이터 존재 여부: true

## 트러블슈팅

Remix에서 Hardhat 네트워크가 `GoChain Testnet`으로 표시됐다. 두 네트워크가 동일한 Chain ID `31337`을 사용하기 때문에 Remix가 네트워크 이름을 잘못 표시한 것이었다. RPC 주소와 Hardhat 터미널의 트랜잭션 기록을 통해 로컬 네트워크에 배포됐음을 확인했다.

또한 최신 Remix 화면에서는 MetaMask 연결 항목이 표시되지 않아 `Dev - Hardhat Provider`를 사용해 로컬 노드에 직접 연결했다. 사용자 트랜잭션 서명은 이후 프론트엔드에서 MetaMask와 ethers.js를 연결해 구현할 예정이다.

## 보안 유의사항

- 실제 ETH와 실제 지갑을 사용하지 않았다.
- Hardhat 테스트 계정의 개인키를 저장소와 Devlog에 기록하지 않았다.
- 복구 문구와 실제 개인정보를 입력하지 않았다.
- 스마트 컨트랙트에 저장하는 문자열은 공개될 수 있으므로 테스트 데이터만 사용했다.

## 다음 작업

- React 프론트엔드에 MetaMask 연결
- 연결된 지갑 주소와 네트워크 표시
- 스마트 컨트랙트 ABI와 배포 주소 연결
- 프론트엔드에서 `createWill`, `ping`, `claim` 호출
- Hardhat 배포 스크립트와 스마트 컨트랙트 테스트 작성