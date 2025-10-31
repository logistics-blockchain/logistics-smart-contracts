import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

// Enable chai-as-promised for async rejections
chai.use(chaiAsPromised.default || chaiAsPromised);

export default chai;
